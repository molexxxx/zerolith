/**
 * The reactivity core: a push-pull signal graph.
 *
 * State and computed values are sources; computed values and effects are
 * consumers. A write pushes an "outdated" mark through the subscribed part
 * of the graph and queues the effects it reaches; reads pull: a computed
 * value recomputes only when it is read and one of its sources actually
 * changed, so a diamond of dependencies evaluates each node once and an
 * effect runs once per batch with every value it reads already settled.
 *
 * Computed values subscribe to their sources only while something observes
 * them. An unobserved computed value is validated on read against a global
 * version counter, which keeps it correct without keeping it alive in its
 * sources' subscriber lists.
 */
import { internal, isInternal, measureRun, trackFlush, trackNode } from "./devtools.js";
import { fail } from "./diagnostics.js";

const RUNNING = 1;
const NOTIFIED = 2;
const OUTDATED = 4;
const DISPOSED = 8;
const HAS_ERROR = 16;
const TRACKING = 32;
/** Set on effects the dev tools create: what they create while running belongs to the dev tools too, and their runs are not announced. */
const INTERNAL = 64;

/** Decides whether a new value counts as a change. */
export type Equals<T> = (previous: T, next: T) => boolean;

/** Options accepted by `signal()` and `computed()`. */
export interface SignalOptions<T>
{
    /** Defaults to `Object.is`. */
    equals?: Equals<T>;
    /** A label shown by the dev tools; it has no effect on behavior. */
    name?: string;
}

/** A value that can be read and tracked. */
export interface ReadableSignal<T>
{
    /** Returns the current value and subscribes the running computed value or effect to it. */
    get(): T;
}

/** A value that can be read, tracked, and written. */
export interface Signal<T> extends ReadableSignal<T>
{
    /** Stores a new value and queues the effects that depend on it. Writes are not allowed inside computed functions. */
    set(value: T): void;
}

/** The function run by `effect()`; it may return a cleanup function. */
export type EffectFunction = () => void | (() => void);

/** The result of `scope()`. */
export interface Scope<T>
{
    /** The value the scope function returned. */
    readonly value: T;
    /** Disposes every effect and nested scope created inside, in reverse order of creation. */
    dispose(): void;
}

interface Source
{
    version: number;
    targets: Edge | undefined;
    edge: Edge | undefined;
    subscribe(edge: Edge): void;
    unsubscribe(edge: Edge): void;
    refresh(): boolean;
}

interface Consumer
{
    flags: number;
    sources: Edge | undefined;
    notify(): void;
}

/** Something an owner disposes: an effect, a nested owner, or a cleanup callback. Internal to the runtime packages. */
export interface Disposable
{
    dispose(): void;
}

interface OwnerNode
{
    children: Disposable[] | undefined;
}

/**
 * Owns the effects and scopes created while it runs, independent of any
 * running effect, so a part of the UI can outlive the effect that created
 * it and still be disposed as a unit. Internal to the runtime packages.
 */
export interface Owner
{
    /** Runs `fn` untracked with this owner current and returns its result. */
    run<T>(fn: () => T): T;
    /** Disposes everything created under this owner, in reverse order of creation. */
    dispose(): void;
}

/**
 * One dependency between a source and a consumer. Edges form two doubly
 * linked lists: the consumer's sources in read order, and the source's
 * subscribed targets.
 */
interface Edge
{
    source: Source;
    target: Consumer;
    version: number;
    prevSource: Edge | undefined;
    nextSource: Edge | undefined;
    prevTarget: Edge | undefined;
    nextTarget: Edge | undefined;
    rollback: Edge | undefined;
}

let consumer: Consumer | undefined;
let owner: OwnerNode | undefined;
let batchDepth = 0;
let pending: Effect | undefined;
let rounds = 0;
let globalVersion = 0;

/** Makes `node` the running consumer and returns the one it replaces. */
function enter(node: Consumer): Consumer | undefined
{
    const previous = consumer;
    consumer = node;
    return previous;
}

/** Makes `node` the current owner and returns the one it replaces. */
function own(node: OwnerNode): OwnerNode | undefined
{
    const previous = owner;
    owner = node;
    return previous;
}

function enqueue(node: Effect): void
{
    node.next = pending;
    pending = node;
}

function linkTarget(source: Source, edge: Edge): void
{
    if (source.targets !== edge && edge.prevTarget === undefined)
    {
        edge.nextTarget = source.targets;
        if (source.targets !== undefined)
        {
            source.targets.prevTarget = edge;
        }
        source.targets = edge;
    }
}

function unlinkTarget(source: Source, edge: Edge): void
{
    if (source.targets === undefined)
    {
        return;
    }
    const prev = edge.prevTarget;
    const next = edge.nextTarget;
    if (prev !== undefined)
    {
        prev.nextTarget = next;
        edge.prevTarget = undefined;
    }
    if (next !== undefined)
    {
        next.prevTarget = prev;
        edge.nextTarget = undefined;
    }
    if (edge === source.targets)
    {
        source.targets = next;
    }
}

/** Records that the running consumer read `source`; returns the edge when the read is tracked. */
function track(source: Source): Edge | undefined
{
    if (consumer === undefined)
    {
        return undefined;
    }
    let edge = source.edge;
    if (edge === undefined || edge.target !== consumer)
    {
        edge = {
            source,
            target: consumer,
            version: 0,
            prevSource: consumer.sources,
            nextSource: undefined,
            prevTarget: undefined,
            nextTarget: undefined,
            rollback: source.edge
        };
        if (consumer.sources !== undefined)
        {
            consumer.sources.nextSource = edge;
        }
        consumer.sources = edge;
        source.edge = edge;
        if (consumer.flags & TRACKING)
        {
            source.subscribe(edge);
        }
        return edge;
    }
    if (edge.version === -1)
    {
        edge.version = 0;
        if (edge.nextSource !== undefined)
        {
            edge.nextSource.prevSource = edge.prevSource;
            if (edge.prevSource !== undefined)
            {
                edge.prevSource.nextSource = edge.nextSource;
            }
            const tail = consumer.sources;
            edge.prevSource = tail;
            edge.nextSource = undefined;
            if (tail !== undefined)
            {
                tail.nextSource = edge;
            }
            consumer.sources = edge;
        }
        return edge;
    }
    return undefined;
}

/** Marks every existing edge as unused and points `sources` at the tail so reads append in order. */
function prepareSources(target: Consumer): void
{
    for (let edge = target.sources; edge !== undefined; edge = edge.nextSource)
    {
        const current = edge.source.edge;
        if (current !== undefined)
        {
            edge.rollback = current;
        }
        edge.source.edge = edge;
        edge.version = -1;
        if (edge.nextSource === undefined)
        {
            target.sources = edge;
            break;
        }
    }
}

/** Drops the edges a run did not read and points `sources` back at the head. */
function cleanupSources(target: Consumer): void
{
    let edge = target.sources;
    let head: Edge | undefined;
    while (edge !== undefined)
    {
        const prev = edge.prevSource;
        if (edge.version === -1)
        {
            edge.source.unsubscribe(edge);
            if (prev !== undefined)
            {
                prev.nextSource = edge.nextSource;
            }
            if (edge.nextSource !== undefined)
            {
                edge.nextSource.prevSource = prev;
            }
        }
        else
        {
            head = edge;
        }
        edge.source.edge = edge.rollback;
        if (edge.rollback !== undefined)
        {
            edge.rollback = undefined;
        }
        edge = prev;
    }
    target.sources = head;
}

/** True when any source changed since the consumer last read it, checked in read order. */
function stale(target: Consumer): boolean
{
    for (let edge = target.sources; edge !== undefined; edge = edge.nextSource)
    {
        const source = edge.source;
        if (source.version !== edge.version || !source.refresh() || source.version !== edge.version)
        {
            return true;
        }
    }
    return false;
}

function endBatch(): void
{
    if (batchDepth > 1)
    {
        batchDepth--;
        return;
    }
    let error: unknown;
    let failed = false;
    let ran = 0;
    while (pending !== undefined)
    {
        let node: Effect | undefined = pending;
        pending = undefined;
        rounds++;
        while (node !== undefined)
        {
            const next: Effect | undefined = node.next;
            node.next = undefined;
            node.flags &= ~NOTIFIED;
            if (!(node.flags & DISPOSED) && stale(node))
            {
                if (!(node.flags & INTERNAL))
                {
                    ran++;
                }
                try
                {
                    node.run();
                }
                catch (caught)
                {
                    if (!failed)
                    {
                        error = caught;
                        failed = true;
                    }
                }
            }
            node = next;
        }
    }
    rounds = 0;
    batchDepth--;
    if (ran > 0)
    {
        trackFlush(ran);
    }
    if (failed)
    {
        throw error;
    }
}

function countTargets(source: Source): number
{
    let count = 0;
    for (let edge = source.targets; edge !== undefined; edge = edge.nextTarget)
    {
        count++;
    }
    return count;
}

class State<T> implements Signal<T>, Source
{
    version = 0;
    targets: Edge | undefined = undefined;
    edge: Edge | undefined = undefined;
    private value: T;
    private readonly equals: Equals<T>;

    constructor(value: T, equals: Equals<T>)
    {
        this.value = value;
        this.equals = equals;
    }

    get(): T
    {
        const edge = track(this);
        if (edge !== undefined)
        {
            edge.version = this.version;
        }
        return this.value;
    }

    set(value: T): void
    {
        if (consumer instanceof Computed)
        {
            throw fail("signal_written_inside_computed");
        }
        if (this.equals(this.value, value))
        {
            return;
        }
        if (rounds > 100)
        {
            throw fail("effect_loop");
        }
        this.value = value;
        this.version++;
        globalVersion++;
        batchDepth++;
        try
        {
            for (let edge = this.targets; edge !== undefined; edge = edge.nextTarget)
            {
                edge.target.notify();
            }
        }
        finally
        {
            endBatch();
        }
    }

    subscribe(edge: Edge): void
    {
        linkTarget(this, edge);
    }

    unsubscribe(edge: Edge): void
    {
        unlinkTarget(this, edge);
    }

    refresh(): boolean
    {
        return true;
    }

    /** Takes a value saved before a development reload. */
    restore(value: unknown): void
    {
        this.set(value as T);
    }
}

class Computed<T> implements ReadableSignal<T>, Source, Consumer
{
    version = 0;
    targets: Edge | undefined = undefined;
    edge: Edge | undefined = undefined;
    flags = OUTDATED;
    sources: Edge | undefined = undefined;
    private value: unknown = undefined;
    private seen = -1;
    private readonly fn: () => T;
    private readonly equals: Equals<T>;

    constructor(fn: () => T, equals: Equals<T>)
    {
        this.fn = fn;
        this.equals = equals;
    }

    get(): T
    {
        if (this.flags & RUNNING)
        {
            throw fail("computed_cycle");
        }
        const edge = track(this);
        this.refresh();
        if (edge !== undefined)
        {
            edge.version = this.version;
        }
        if (this.flags & HAS_ERROR)
        {
            throw this.value;
        }
        return this.value as T;
    }

    /** The last result without computing, for the dev tools: absent before the first run and while the last run threw. */
    cached(): { value?: unknown }
    {
        return this.version === 0 || this.flags & HAS_ERROR ? {} : { value: this.value };
    }

    refresh(): boolean
    {
        this.flags &= ~NOTIFIED;
        if (this.flags & RUNNING)
        {
            return false;
        }
        if ((this.flags & (OUTDATED | TRACKING)) === TRACKING)
        {
            return true;
        }
        this.flags &= ~OUTDATED;
        if (this.seen === globalVersion)
        {
            return true;
        }
        this.seen = globalVersion;
        this.flags |= RUNNING;
        if (this.version > 0 && !stale(this))
        {
            this.flags &= ~RUNNING;
            return true;
        }
        const previous = enter(this);
        try
        {
            prepareSources(this);
            const value = this.fn();
            if ((this.flags & HAS_ERROR) || this.version === 0 || !this.equals(this.value as T, value))
            {
                this.value = value;
                this.flags &= ~HAS_ERROR;
                this.version++;
            }
        }
        catch (error)
        {
            this.value = error;
            this.flags |= HAS_ERROR;
            this.version++;
        }
        consumer = previous;
        cleanupSources(this);
        this.flags &= ~RUNNING;
        return true;
    }

    notify(): void
    {
        if (!(this.flags & NOTIFIED))
        {
            this.flags |= OUTDATED | NOTIFIED;
            for (let edge = this.targets; edge !== undefined; edge = edge.nextTarget)
            {
                edge.target.notify();
            }
        }
    }

    subscribe(edge: Edge): void
    {
        if (this.targets === undefined)
        {
            this.flags |= OUTDATED | TRACKING;
            for (let source = this.sources; source !== undefined; source = source.nextSource)
            {
                source.source.subscribe(source);
            }
        }
        linkTarget(this, edge);
    }

    unsubscribe(edge: Edge): void
    {
        if (this.targets !== undefined)
        {
            unlinkTarget(this, edge);
            if (this.targets === undefined)
            {
                this.flags &= ~TRACKING;
                for (let source = this.sources; source !== undefined; source = source.nextSource)
                {
                    source.source.unsubscribe(source);
                }
            }
        }
    }
}

class Effect implements Consumer, OwnerNode
{
    flags = TRACKING;
    sources: Edge | undefined = undefined;
    next: Effect | undefined = undefined;
    children: Disposable[] | undefined = undefined;
    private fn: EffectFunction | undefined;
    private cleanup: (() => void) | undefined = undefined;

    constructor(fn: EffectFunction)
    {
        this.fn = fn;
        if (isInternal())
        {
            this.flags |= INTERNAL;
        }
    }

    run(): void
    {
        if (this.flags & RUNNING)
        {
            throw fail("effect_cycle");
        }
        this.flags |= RUNNING;
        this.flags &= ~DISPOSED;
        this.settle();
        prepareSources(this);
        batchDepth++;
        const previousConsumer = enter(this);
        const previousOwner = own(this);
        try
        {
            if (this.fn !== undefined)
            {
                const cleanup = this.flags & INTERNAL ? internal(this.fn) : this.fn();
                if (typeof cleanup === "function")
                {
                    this.cleanup = cleanup;
                }
            }
        }
        finally
        {
            consumer = previousConsumer;
            owner = previousOwner;
            cleanupSources(this);
            this.flags &= ~RUNNING;
            if (this.flags & DISPOSED)
            {
                this.release();
            }
            endBatch();
        }
    }

    notify(): void
    {
        if (!(this.flags & NOTIFIED))
        {
            this.flags |= NOTIFIED;
            enqueue(this);
        }
    }

    dispose(): void
    {
        this.flags |= DISPOSED;
        if (!(this.flags & RUNNING))
        {
            this.release();
        }
    }

    /** Disposes nested effects and scopes, then runs the cleanup the last run returned. */
    private settle(): void
    {
        const children = this.children;
        this.children = undefined;
        const cleanup = this.cleanup;
        this.cleanup = undefined;
        if (children === undefined && cleanup === undefined)
        {
            return;
        }
        batchDepth++;
        const previous = consumer;
        consumer = undefined;
        try
        {
            if (children !== undefined)
            {
                disposeAll(children);
            }
            if (cleanup !== undefined)
            {
                cleanup();
            }
        }
        catch (error)
        {
            this.flags &= ~RUNNING;
            this.flags |= DISPOSED;
            this.release();
            throw error;
        }
        finally
        {
            consumer = previous;
            endBatch();
        }
    }

    private release(): void
    {
        for (let edge = this.sources; edge !== undefined; edge = edge.nextSource)
        {
            edge.source.unsubscribe(edge);
        }
        this.fn = undefined;
        this.sources = undefined;
        this.settle();
    }
}

function disposeAll(children: Disposable[]): void
{
    while (children.length > 0)
    {
        children.pop()?.dispose();
    }
}

function adopt(child: Disposable): void
{
    if (owner !== undefined)
    {
        if (owner.children === undefined)
        {
            owner.children = [];
        }
        owner.children.push(child);
    }
}

/** Creates a writable signal. */
export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T>
{
    const node = new State(initial, options?.equals ?? Object.is);
    trackNode(node, "state", options?.name, inspectSource);
    return node;
}

/** Reads a source's value and observer count for the dev tools without holding the source. */
function inspectSource(node: Source & ReadableSignal<unknown>): { value: unknown; observers: number }
{
    return { value: untracked(() => node.get()), observers: countTargets(node) };
}

/** Reads a computed value's last result for the dev tools without running it, so inspecting never re-enters or changes a computation. */
function inspectComputed<T>(node: Computed<T>): { value?: unknown; observers: number }
{
    return { ...node.cached(), observers: countTargets(node) };
}

function inspectEffect(): { observers: number }
{
    return { observers: 0 };
}

/** Creates a lazily evaluated, memoized value derived from other signals. The function must not write signals. */
export function computed<T>(fn: () => T, options?: SignalOptions<T>): ReadableSignal<T>
{
    const node = new Computed(fn, options?.equals ?? Object.is);
    trackNode(node, "computed", options?.name ?? (fn.name === "" ? undefined : fn.name), inspectComputed);
    return node;
}

/**
 * Runs `fn` now and again whenever a signal it read changes. A returned
 * function is called before the next run and on dispose. Returns the
 * dispose function; the effect is also disposed with its enclosing effect
 * or scope.
 */
export function effect(fn: EffectFunction): () => void
{
    const node = startEffect(fn);
    return () =>
    {
        node.dispose();
    };
}

/**
 * Starts an effect as `effect` does and returns the effect itself, which
 * the runtime's own bindings hold instead of a dispose function. Internal
 * to the runtime packages.
 */
export function startEffect(fn: EffectFunction): Disposable
{
    const node = new Effect(fn);
    trackNode(node, "effect", fn.name === "" ? undefined : fn.name, inspectEffect);
    try
    {
        measureRun("Signals", "effect", node);
    }
    catch (error)
    {
        node.dispose();
        throw error;
    }
    adopt(node);
    return node;
}

/** Applies several writes and runs the affected effects once, after `fn` returns. */
export function batch<T>(fn: () => T): T
{
    if (batchDepth > 0)
    {
        return fn();
    }
    batchDepth++;
    try
    {
        return fn();
    }
    finally
    {
        endBatch();
    }
}

/** Runs `fn` without subscribing the running computed value or effect to the signals it reads. */
export function untracked<T>(fn: () => T): T
{
    const previous = consumer;
    consumer = undefined;
    try
    {
        return fn();
    }
    finally
    {
        consumer = previous;
    }
}

/**
 * Creates an owner, itself owned by the current effect or scope. A
 * `detached` owner is not: whoever creates it disposes it, as a keyed list
 * does for its rows, so an owner disposed on its own leaves nothing behind
 * in the owner around it.
 */
export function createOwner(detached = false): Owner
{
    const node: OwnerNode = { children: undefined };
    const inside = isInternal();
    const handle: Owner = {
        run<T>(fn: () => T): T
        {
            const previousOwner = owner;
            const previousConsumer = consumer;
            owner = node;
            consumer = undefined;
            try
            {
                return inside ? internal(fn) : fn();
            }
            finally
            {
                owner = previousOwner;
                consumer = previousConsumer;
            }
        },
        dispose(): void
        {
            const children = node.children;
            node.children = undefined;
            if (children !== undefined)
            {
                disposeAll(children);
            }
        }
    };
    if (!detached)
    {
        adopt(handle);
    }
    return handle;
}

/**
 * Runs `fn` untracked as the owner of every effect and scope created inside
 * it, so they can be disposed together.
 */
export function scope<T>(fn: () => T): Scope<T>
{
    const handle = createOwner();
    let value: T;
    try
    {
        value = handle.run(fn);
    }
    catch (error)
    {
        handle.dispose();
        throw error;
    }
    return { value, dispose: () => handle.dispose() };
}

/** True for values created by `signal()` or `computed()`. */
export function isSignal(value: unknown): value is ReadableSignal<unknown>
{
    return value instanceof State || value instanceof Computed;
}

/** Registers `fn` to run when the enclosing effect re-runs or is disposed, or when the enclosing scope is disposed. */
export function onDispose(fn: () => void): void
{
    if (owner === undefined)
    {
        throw fail("on_dispose_outside_scope");
    }
    adopt({ dispose: fn });
}
