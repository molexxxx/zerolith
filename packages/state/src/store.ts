/**
 * A store: nested plain objects and arrays read through proxies whose
 * fields are signals, each made the first time a binding, an effect, or a
 * computed value reads it, and changed only through the store's setter.
 */
import { type Signal, ZerolithError, batch, diagnostic, isTracking, signal } from "zerolith";

/** A store as its readers see it: every field read-only, nested objects and arrays included. */
export type Store<T> = T extends (...args: never[]) => unknown
    ? T
    : T extends ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | Date | RegExp | Promise<unknown>
        ? T
        : T extends object
            ? { readonly [K in keyof T]: Store<T[K]> }
            : T;

/** The plain, writable type of a store's read-only view, as `snapshot` returns it. */
export type Snapshot<S> = S extends (...args: never[]) => unknown
    ? S
    : S extends ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | Date | RegExp | Promise<unknown>
        ? S
        : S extends object
            ? { -readonly [K in keyof S]: Snapshot<S[K]> }
            : S;

/** The keys a path may take at `T`: an index of an array, a property name of an object. */
type Key<T> = NonNullable<T> extends readonly unknown[] ? number : keyof NonNullable<T> & (string | number);

/** The value a path reaches at key `K` of `T`. */
type At<T, K> = NonNullable<T> extends readonly (infer E)[] ? E : K extends keyof NonNullable<T> ? NonNullable<T>[K] : never;

/** What the last key of a path takes: a value, a function of the value there now that returns the next, or `reconcile(data)`. */
export type Next<V> = V | ((previous: V) => V) | Reconciled<V>;

/** Sets the value at a path of keys into the store, waking only what reads the fields that changed. */
export type SetStore<T> = {
    <A extends Key<T>>(a: A, next: Next<At<T, A>>): void;
    <A extends Key<T>, B extends Key<At<T, A>>>(a: A, b: B, next: Next<At<At<T, A>, B>>): void;
    <A extends Key<T>, B extends Key<At<T, A>>, C extends Key<At<At<T, A>, B>>>(a: A, b: B, c: C, next: Next<At<At<At<T, A>, B>, C>>): void;
    <A extends Key<T>, B extends Key<At<T, A>>, C extends Key<At<At<T, A>, B>>, D extends Key<At<At<At<T, A>, B>, C>>>(a: A, b: B, c: C, d: D, next: Next<At<At<At<At<T, A>, B>, C>, D>>): void;
};

/** Data to merge into a store by `reconcile`, which the setter takes in place of a value. */
export class Reconciled<T>
{
    /** The data to merge. */
    readonly data: T;
    /** The field that matches an item of an array to the item it replaces, or undefined to match by index. */
    readonly key: string | undefined;

    /** Holds `data` and `key` for the setter; `reconcile(data, key)` makes one. */
    constructor(data: T, key: string | undefined)
    {
        this.data = data;
        this.key = key;
    }
}

const proxies: WeakMap<object, object> = new WeakMap();
const raws: WeakMap<object, object> = new WeakMap();
const fields: WeakMap<object, Map<PropertyKey, Signal<unknown>>> = new WeakMap();
const KEYS: unique symbol = Symbol("keys");

/** Whether a value is held in the store as fields: a plain object or array that is not frozen. Maps, Sets, class instances, and frozen objects are values. */
function plain(value: unknown): value is object
{
    if (typeof value !== "object" || value === null || Object.isFrozen(value))
    {
        return false;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null || (Array.isArray(value) && prototype === Array.prototype);
}

/** The read-only view of a value the store holds: its proxy, made once, for a plain object or array. */
function wrap(value: unknown): unknown
{
    if (!plain(value))
    {
        return value;
    }
    let proxy = proxies.get(value);
    if (proxy === undefined)
    {
        proxy = new Proxy(value, handler);
        proxies.set(value, proxy);
        raws.set(proxy, value);
    }
    return proxy;
}

/** The signal of a field of `raw`, made the first time something reads it while tracking. */
function field(raw: object, key: PropertyKey, value: unknown): Signal<unknown>
{
    let map = fields.get(raw);
    if (map === undefined)
    {
        map = new Map();
        fields.set(raw, map);
    }
    let found = map.get(key);
    if (found === undefined)
    {
        found = signal(value);
        map.set(key, found);
    }
    return found;
}

function refuse(): never
{
    throw new ZerolithError(diagnostic("state_store_assigned", "error"));
}

const handler: ProxyHandler<object> = {
    get(raw, key)
    {
        const value: unknown = Reflect.get(raw, key);
        if (Array.isArray(raw) || typeof key === "symbol" || !isTracking() || (!Object.hasOwn(raw, key) && key in raw))
        {
            return wrap(value);
        }
        return wrap(field(raw, key, value).get());
    },
    ownKeys(raw)
    {
        if (!Array.isArray(raw) && isTracking())
        {
            field(raw, KEYS, undefined).get();
        }
        return Reflect.ownKeys(raw);
    },
    set: refuse,
    deleteProperty: refuse,
    defineProperty: refuse,
    setPrototypeOf: refuse
};

/** Writes `value` to the field `key` of the object `raw` and wakes what reads it, and what reads its keys when the field is new. */
function assign(raw: object, key: PropertyKey, value: unknown): void
{
    const added = !Object.hasOwn(raw, key);
    (raw as Record<PropertyKey, unknown>)[key] = value;
    const map = fields.get(raw);
    map?.get(key)?.set(value);
    if (added)
    {
        map?.get(KEYS)?.set({});
    }
}

/** Removes the field `key` of the object `raw` and wakes what reads it and its keys. */
function remove(raw: object, key: PropertyKey): void
{
    delete (raw as Record<PropertyKey, unknown>)[key];
    const map = fields.get(raw);
    map?.get(key)?.set(undefined);
    map?.get(KEYS)?.set({});
}

/** `value` with every store view in it, at any depth, replaced by the data it shows, so the store holds its data and never a view of it. */
function unwrap(value: unknown, seen: Set<object> = new Set()): unknown
{
    const raw = raws.get(value as object);
    if (raw !== undefined)
    {
        return raw;
    }
    if (!plain(value) || proxies.has(value) || seen.has(value))
    {
        return value;
    }
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const name of Object.keys(record))
    {
        const inner = record[name];
        const unwrapped = unwrap(inner, seen);
        if (unwrapped !== inner)
        {
            record[name] = unwrapped;
        }
    }
    return value;
}

/** `next` merged into `current`: objects keep their identity and change field by field, arrays keep the items `key` matches, or each index without one. */
function merge(current: unknown, next: unknown, key: string | undefined): unknown
{
    if (!plain(current) || !plain(next) || Array.isArray(current) !== Array.isArray(next))
    {
        return next;
    }
    if (Array.isArray(next))
    {
        const previous = current as unknown[];
        const matched = key === undefined ? undefined : new Map(previous.filter(plain).map((item) => [(item as Record<string, unknown>)[key], item]));
        const merged = next.map((item, index) =>
        {
            const match = matched === undefined ? previous[index] : plain(item) ? matched.get((item as Record<string, unknown>)[key as string]) : undefined;
            return match === undefined ? item : merge(match, item, key);
        });
        return merged.length === previous.length && merged.every((item, index) => item === previous[index]) ? previous : merged;
    }
    const target = current as Record<string, unknown>;
    const source = next as Record<string, unknown>;
    for (const name of Object.keys(source))
    {
        const value = merge(target[name], source[name], key);
        if (!Object.is(value, target[name]) || !Object.hasOwn(target, name))
        {
            assign(target, name, value);
        }
    }
    for (const name of Object.keys(target))
    {
        if (!Object.hasOwn(source, name))
        {
            remove(target, name);
        }
    }
    return current;
}

/** What the setter writes for `next` where the path holds `current`. */
function resolve(next: unknown, current: unknown): unknown
{
    if (next instanceof Reconciled)
    {
        return merge(current, unwrap(next.data), next.key);
    }
    return unwrap(typeof next === "function" ? (next as (previous: unknown) => unknown)(current) : next);
}

/**
 * Writes `next` at `path` below `raw`, from the key at `index` on, and
 * returns `raw`, or a copy of it when `raw` is an array whose item
 * changed: an object changes in place, field by field, and an array is
 * replaced, so whatever reads the list sees a new one.
 */
function write(raw: object, path: readonly PropertyKey[], index: number, next: unknown): object
{
    const key = path[index] as PropertyKey;
    const current = (raw as Record<PropertyKey, unknown>)[key];
    let value: unknown;
    if (index === path.length - 1)
    {
        value = resolve(next, current);
    }
    else
    {
        if (!plain(current))
        {
            throw new ZerolithError(diagnostic("state_store_path_missing", "error", { key: String(key) }));
        }
        value = write(current, path, index + 1, next);
    }
    if (Object.is(value, current) && (Array.isArray(raw) || Object.hasOwn(raw, key)))
    {
        return raw;
    }
    if (Array.isArray(raw))
    {
        const replaced = raw.slice();
        replaced[key as number] = value;
        return replaced;
    }
    assign(raw, key, value);
    return raw;
}

/**
 * Creates a store of `initial`, a plain object, and returns it read-only
 * with its setter: `const [board, setBoard] = store({ rows: [] })`. A
 * field is a signal from the first time a binding, an effect, or a
 * computed value reads it, so it wakes only what reads it; a read
 * anywhere else is a property lookup. `setBoard("rows", 3, "label",
 * "renamed")` changes one field; a function as the last argument gets the
 * value there now and returns the next; `reconcile(data, "id")` merges
 * data sent again whole. Writing an item of an array replaces the array,
 * so a list over it, as `each(computed(() => board.rows), ...)`, sees the
 * change; writing a field of an object changes only that field. The store
 * keeps `initial` and changes it in place. Assigning to the store throws
 * `state_store_assigned`, and a path through a value that is not an
 * object or array throws `state_store_path_missing`.
 */
export function store<T extends object>(initial: T): [Store<T>, SetStore<T>]
{
    if (!plain(initial) || Array.isArray(initial))
    {
        throw new TypeError("store() takes a plain object, such as { rows: [] }");
    }
    const view = wrap(unwrap(initial)) as Store<T>;
    const set = (...args: unknown[]): void =>
    {
        const next = args.pop();
        if (args.length === 0)
        {
            throw new TypeError("a store's setter takes a path of at least one key before the value, such as setBoard(\"rows\", [])");
        }
        batch(() =>
        {
            write(initial, args as PropertyKey[], 0, next);
        });
    };
    return [view, set as SetStore<T>];
}

/** Data to merge into a store with the setter, as `setBoard("rows", reconcile(rows, "id"))`: the items `key` matches keep their identity and change only in the fields that differ, so only what reads those fields wakes. Without `key`, items match by index. */
export function reconcile<T>(data: T, key?: string): Reconciled<T>
{
    return new Reconciled(data, key);
}

/** A plain copy of a store or of any part of it, for code that wants ordinary objects. */
export function snapshot<S>(value: S): Snapshot<S>
{
    return copy(raws.get(value as object) ?? value, new Map()) as Snapshot<S>;
}

function copy(value: unknown, seen: Map<object, unknown>): unknown
{
    if (!plain(value))
    {
        return value;
    }
    const known = seen.get(value);
    if (known !== undefined)
    {
        return known;
    }
    if (Array.isArray(value))
    {
        const list: unknown[] = [];
        seen.set(value, list);
        for (const item of value)
        {
            list.push(copy(item, seen));
        }
        return list;
    }
    const record: Record<string, unknown> = {};
    seen.set(value, record);
    for (const [name, inner] of Object.entries(value))
    {
        record[name] = copy(inner, seen);
    }
    return record;
}
