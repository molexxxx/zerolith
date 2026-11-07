/**
 * A signal kept in the browser's storage under a key, as JSON, and in step
 * across tabs through the `storage` event.
 */
import { type Signal, diagnostic, effect, hasOwner, onDispose, report, signal } from "zerolith";

/** Options for `stored`. */
export interface StoredOptions<T>
{
    /** Which storage keeps the value: `localStorage`, shared across tabs and kept across sessions, or `sessionStorage`, this tab's alone. Defaults to local. */
    storage?: "local" | "session";
    /** When two values count as the same, so a set of an equal value changes nothing; the signal's own option. */
    equals?: (previous: T, next: T) => boolean;
    /**
     * Whether a kept value, once parsed, is one the signal can hold. A value
     * it refuses, or throws on, is read as `initial` and reported as
     * `state_storage_unreadable`, on creation and when another tab writes the
     * key, so data of another shape, such as another app's under the same
     * key, never reaches the page.
     */
    validate?: (value: unknown) => boolean;
}

/** The storage kinds reported unavailable on this page, each once. */
const unavailable = new Set<string>();

/** How many stored signals are live for each key of each storage, so a second one for a key is reported. */
const live = new Map<string, number>();

/** What runs after a stored signal takes a value another tab wrote, keyed by the signal. */
const outside = new WeakMap<Signal<unknown>, Set<() => void>>();

/**
 * Runs `listener` each time `source` takes a value another tab wrote, which
 * only a stored signal does, and returns the function that stops it. The
 * history uses it; the package does not export it.
 */
export function onOutsideWrite(source: Signal<unknown>, listener: () => void): () => void
{
    let listeners = outside.get(source);
    if (listeners === undefined)
    {
        listeners = new Set();
        outside.set(source, listeners);
    }
    listeners.add(listener);
    return () =>
    {
        listeners.delete(listener);
    };
}

/** The storage of a kind, or undefined where the page has none or refuses it, which is reported once per kind with the first key asked for. */
function storageOf(kind: "local" | "session", key: string): Storage | undefined
{
    try
    {
        const store = kind === "session" ? globalThis.sessionStorage : globalThis.localStorage;
        store.getItem("");
        return store;
    }
    catch
    {
        if (!unavailable.has(kind))
        {
            unavailable.add(kind);
            report(diagnostic("state_storage_unavailable", "warning", { storage: kind, key }));
        }
        return undefined;
    }
}

/** The value kept as `raw` under `key`, or `initial` where nothing is kept, or where what is kept does not parse or `validate` refuses it, which is reported. */
function parse<T>(raw: string | null, key: string, initial: T, validate: ((value: unknown) => boolean) | undefined): T
{
    if (raw === null)
    {
        return initial;
    }
    let value: unknown;
    let accepted: boolean;
    try
    {
        value = JSON.parse(raw);
        accepted = validate === undefined || validate(value);
    }
    catch
    {
        accepted = false;
    }
    if (!accepted)
    {
        report(diagnostic("state_storage_unreadable", "warning", { key }));
        return initial;
    }
    return value as T;
}

/** The JSON for `next`, or undefined for a value JSON cannot hold: a BigInt or a cycle, which throws, and a function or a symbol, which it leaves out. */
function toJson(next: unknown): string | undefined
{
    try
    {
        return JSON.stringify(next);
    }
    catch
    {
        return undefined;
    }
}

/**
 * A writable signal kept in storage under `key` as JSON: read back on
 * creation, written on every set, and set again when another tab writes
 * the key, so every tab shows the same value. A missing value takes
 * `initial` quietly; one that does not parse, or that the `validate`
 * option refuses, takes `initial` and reports `state_storage_unreadable`. Setting `undefined` removes the key, so it
 * reads back as `initial`; a value JSON cannot hold, such as a BigInt,
 * stays in memory and reports `state_value_not_json`. Where the page has
 * no storage, as on the server, the signal is a plain one and
 * `state_storage_unavailable` is reported once, as it is for each write
 * the storage refuses. Create each key once and share the signal: two
 * stored signals for one key in the same tab do not hear each other,
 * since the storage event tells other tabs alone, and the second reports
 * `state_key_duplicate`. The write and the listener for other tabs are
 * disposed with the enclosing owner when there is one, after which the
 * signal keeps its value in memory alone; created in plain code, they
 * live for the page.
 */
export function stored<T>(key: string, initial: T, options: StoredOptions<T> = {}): Signal<T>
{
    const kind = options.storage ?? "local";
    const store = storageOf(kind, key);
    const value = signal<T>(store === undefined ? initial : parse(store.getItem(key), key, initial, options.validate), options.equals === undefined ? undefined : { equals: options.equals });
    if (store === undefined)
    {
        return value;
    }
    const id = `${kind}:${key}`;
    const count = (live.get(id) ?? 0) + 1;
    live.set(id, count);
    if (count > 1)
    {
        report(diagnostic("state_key_duplicate", "warning", { storage: kind, key }));
    }
    let first = true;
    let echo = false;
    effect(() =>
    {
        const next = value.get();
        if (first || echo)
        {
            first = false;
            return;
        }
        const json = toJson(next);
        if (json === undefined && next !== undefined)
        {
            report(diagnostic("state_value_not_json", "warning", { key }));
            return;
        }
        try
        {
            if (json === undefined)
            {
                store.removeItem(key);
            }
            else
            {
                store.setItem(key, json);
            }
        }
        catch
        {
            report(diagnostic("state_storage_unavailable", "warning", { storage: kind, key }));
        }
    });
    const onStorage = (event: StorageEvent): void =>
    {
        if (event.storageArea !== store || (event.key !== null && event.key !== key))
        {
            return;
        }
        echo = true;
        try
        {
            value.set(parse(event.newValue, key, initial, options.validate));
        }
        finally
        {
            echo = false;
        }
        for (const listener of outside.get(value as Signal<unknown>) ?? [])
        {
            listener();
        }
    };
    addEventListener("storage", onStorage);
    if (hasOwner())
    {
        onDispose(() =>
        {
            removeEventListener("storage", onStorage);
            const left = (live.get(id) ?? 1) - 1;
            if (left > 0)
            {
                live.set(id, left);
            }
            else
            {
                live.delete(id);
            }
        });
    }
    return value;
}
