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
import { ZerolithError, diagnostic, fail, report } from "./diagnostics.js";

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
    /** A label for the dev tools; `zerolith dev` and the Vite plugin also keep the value of a `signal` with a name across an edit, while a computed value is computed again. */
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

/** A disposable an owner holds, linked to the child adopted before it, so an owner keeps its children without an array. Internal to the runtime packages. */
export interface Child extends Disposable
{
    previous: Child | undefined;
}

/** What owns children: an owner, or an effect or binding while it runs. Internal to the runtime packages. */
export interface OwnerNode
{
    /** The newest child, which links to the older ones. */
    children: Child | undefined;
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
let pending: Reaction | undefined;
let rounds = 0;
/** How many computed functions are running, so a write inside one is refused whatever tracking state `untracked` or a nested effect sets. */
let computing = 0;
let globalVersion = 0;

/** A value given to one context by `provide`, and the values provided around that call. */
interface Frame
{
    readonly context: object;
    readonly value: unknown;
    readonly parent: Frame | undefined;
    /** The nearest boundary around the call, which takes what an effect or a binding created inside it throws. */
    readonly guard: ((error: unknown) => void) | undefined;
}

/** The values provided around the code running now. */
let frame: Frame | undefined;
/** The values provided around each effect, computed value, and view when it was created, and around each binding created inside a boundary; made on the first `provide` or boundary, so an application with neither pays one check per creation and run. */
let frames: WeakMap<object, Frame> | undefined;

/** Records the values provided around `target` as it is created, for `recall` to give back each time it runs. Internal to the runtime packages. */
export function remember(target: object): void
{
    if (frame !== undefined)
    {
        (frames as WeakMap<object, Frame>).set(target, frame);
    }
}

/** Makes the values provided around `target` when it was created the current ones, and returns the ones they replace, for `restore`. Internal to the runtime packages. */
export function recall(target: object): unknown
{
    const previous = frame;
    if (frames !== undefined)
    {
        frame = frames.get(target);
    }
    return previous;
}

/** Puts back the provided values `recall` replaced. Internal to the runtime packages. */
export function restore(previous: unknown): void
{
    frame = previous as Frame | undefined;
}

/** Runs `fn` with `handler` as the boundary of the effects and bindings it creates: when one of them throws as it runs, `handler` takes the error in place of the code that caused the run. Internal to the runtime packages. */
export function guard<T>(handler: (error: unknown) => void, fn: () => T): T
{
    frames ??= new WeakMap();
    const previous = frame;
    frame = { context: handler, value: undefined, parent: previous, guard: handler };
    try
    {
        return fn();
    }
    finally
    {
        frame = previous;
    }
}

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

function enqueue(node: Reaction): void
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

/**
 * Runs the effects a batch notified, round after round until none is
 * pending. One effect that throws does not stop the others; the error is
 * thrown once the flush ends, and when several effects threw, an
 * `AggregateError` holds them all, the first one first.
 */
function endBatch(): void
{
    if (batchDepth > 1)
    {
        batchDepth--;
        return;
    }
    const errors: unknown[] = [];
    let ran = 0;
    while (pending !== undefined)
    {
        let node: Reaction | undefined = pending;
        pending = undefined;
        rounds++;
        while (node !== undefined)
        {
            const next: Reaction | undefined = node.next;
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
                    errors.push(caught);
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
    if (errors.length === 1)
    {
        throw errors[0];
    }
    if (errors.length > 1)
    {
        throw new AggregateError(errors, `zerolith: ${errors.length} effects threw in one update`);
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
    private current: T;
    private readonly equals: Equals<T>;

    constructor(value: T, equals: Equals<T>)
    {
        this.current = value;
        this.equals = equals;
    }

    get(): T
    {
        const edge = track(this);
        if (edge !== undefined)
        {
            edge.version = this.version;
        }
        return this.current;
    }

    set(value: T): void
    {
        if (computing > 0)
        {
            throw fail("signal_written_inside_computed");
        }
        if (this.equals(this.current, value))
        {
            return;
        }
        if (rounds > 100)
        {
            throw fail("effect_loop");
        }
        this.current = value;
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
    private current: unknown = undefined;
    private seen = -1;
    private readonly fn: () => T;
    private readonly equals: Equals<T>;

    constructor(fn: () => T, equals: Equals<T>)
    {
        this.fn = fn;
        this.equals = equals;
        remember(this);
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
            throw this.current;
        }
        return this.current as T;
    }

    /** The last result without computing, for the dev tools: absent before the first run and while the last run threw. */
    cached(): { value?: unknown }
    {
        return this.version === 0 || this.flags & HAS_ERROR ? {} : { value: this.current };
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
        const provided = recall(this);
        computing++;
        try
        {
            prepareSources(this);
            const value = this.fn();
            if ((this.flags & HAS_ERROR) || this.version === 0 || !this.equals(this.current as T, value))
            {
                this.current = value;
                this.flags &= ~HAS_ERROR;
                this.version++;
            }
        }
        catch (error)
        {
            this.current = error;
            this.flags |= HAS_ERROR;
            this.version++;
        }
        computing--;
        consumer = previous;
        restore(provided);
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

/**
 * What effects and bindings share: each runs again when a source it read
 * changes, owns what it creates while running, and disposes that before
 * its next run and when it is disposed.
 */
abstract class Reaction implements Consumer, OwnerNode, Child
{
    flags = TRACKING;
    sources: Edge | undefined = undefined;
    next: Reaction | undefined = undefined;
    children: Child | undefined = undefined;
    previous: Child | undefined = undefined;
    protected cleanup: (() => void) | undefined = undefined;
    /** True after a run whose own function threw, as opposed to a run whose flush threw for another effect. */
    failed = false;

    constructor()
    {
        if (isInternal())
        {
            this.flags |= INTERNAL;
        }
    }

    /** Does the reaction's work, with it as the consumer and the owner; returns what an effect function returned. */
    protected abstract execute(): unknown;

    /** Lets go of what the work refers to, once the reaction is disposed. */
    protected abstract forget(): void;

    run(): void
    {
        this.flags |= RUNNING;
        this.flags &= ~DISPOSED;
        this.settle();
        prepareSources(this);
        batchDepth++;
        const previousConsumer = enter(this);
        const previousOwner = own(this);
        let failure: unknown;
        let failed = false;
        try
        {
            if (!(this.flags & DISPOSED))
            {
                const cleanup = this.execute();
                if (typeof cleanup === "function")
                {
                    this.cleanup = cleanup as () => void;
                }
                else if (isThenable(cleanup))
                {
                    report(diagnostic("effect_async", "warning"));
                }
            }
        }
        catch (caught)
        {
            failure = caught;
            failed = true;
        }
        consumer = previousConsumer;
        owner = previousOwner;
        cleanupSources(this);
        if (failed && frames !== undefined)
        {
            const handler = frames.get(this)?.guard;
            if (handler !== undefined)
            {
                try
                {
                    handler(failure);
                    failed = false;
                }
                catch (error)
                {
                    failure = error;
                }
            }
        }
        this.flags &= ~RUNNING;
        this.failed = failed;
        if (failed && failure instanceof ZerolithError && failure.diagnostic.code === "effect_loop")
        {
            this.flags |= DISPOSED;
        }
        if (this.flags & DISPOSED)
        {
            this.release();
        }
        finish(failed, failure);
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
        let failure: unknown;
        let failed = false;
        if (children !== undefined)
        {
            try
            {
                disposeAll(children);
            }
            catch (caught)
            {
                failure = caught;
                failed = true;
            }
        }
        if (cleanup !== undefined)
        {
            try
            {
                cleanup();
            }
            catch (caught)
            {
                if (!failed)
                {
                    failure = caught;
                    failed = true;
                }
            }
        }
        if (failed)
        {
            this.flags &= ~RUNNING;
            this.flags |= DISPOSED;
            this.release();
        }
        consumer = previous;
        finish(failed, failure);
    }

    private release(): void
    {
        for (let edge = this.sources; edge !== undefined; edge = edge.nextSource)
        {
            edge.source.unsubscribe(edge);
        }
        this.forget();
        this.sources = undefined;
        this.settle();
    }
}

class Effect extends Reaction
{
    private fn: EffectFunction | undefined;

    constructor(fn: EffectFunction)
    {
        super();
        this.fn = fn;
        remember(this);
    }

    protected execute(): unknown
    {
        const fn = this.fn;
        if (fn === undefined)
        {
            return undefined;
        }
        const provided = recall(this);
        try
        {
            return this.flags & INTERNAL ? internal(fn) : fn();
        }
        finally
        {
            restore(provided);
        }
    }

    protected forget(): void
    {
        this.fn = undefined;
    }
}

/** Where a binding writes its signal's value: one of the runtime's parts. Internal to the runtime packages. */
export interface Sink
{
    /** Takes the value, run as an effect's function runs: with the binding as the consumer and the owner of what taking it creates. */
    receive(value: unknown): void;
}

/**
 * An effect that reads one signal and writes its value to a sink, as the
 * runtime binds a signal to the page. It holds the signal and the sink
 * where an effect would hold a closure over both, so a binding costs one
 * object.
 */
class Binding extends Reaction
{
    private source: ReadableSignal<unknown> | undefined;
    private sink: Sink | undefined;

    constructor(source: ReadableSignal<unknown>, sink: Sink)
    {
        super();
        this.source = source;
        this.sink = sink;
        if (frame?.guard !== undefined)
        {
            (frames as WeakMap<object, Frame>).set(this, frame);
        }
    }

    protected execute(): unknown
    {
        const { source, sink } = this;
        if (source === undefined || sink === undefined)
        {
            return undefined;
        }
        if (this.flags & INTERNAL)
        {
            internal(() =>
            {
                sink.receive(source.get());
            });
            return undefined;
        }
        sink.receive(source.get());
        return undefined;
    }

    protected forget(): void
    {
        this.source = undefined;
        this.sink = undefined;
    }
}

/** Disposes `newest` and every child adopted before it, newest first, and rethrows the first error once all are disposed, so one failing cleanup cannot leave its siblings running. */
function disposeAll(newest: Child): void
{
    let error: unknown;
    let failed = false;
    let child: Child | undefined = newest;
    while (child !== undefined)
    {
        const previous: Child | undefined = child.previous;
        child.previous = undefined;
        try
        {
            child.dispose();
        }
        catch (caught)
        {
            if (!failed)
            {
                error = caught;
                failed = true;
            }
        }
        child = previous;
    }
    if (failed)
    {
        throw error;
    }
}

function adopt(child: Child): void
{
    if (owner !== undefined)
    {
        child.previous = owner.children;
        owner.children = child;
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
    return start(node);
}

/**
 * Binds `source` to `sink` as `startEffect(() => sink.receive(source.get()))`
 * would, writing now and whenever the signal changes, without a closure.
 * Internal to the runtime packages.
 */
export function startBinding(source: ReadableSignal<unknown>, sink: Sink): Disposable
{
    const node = new Binding(source, sink);
    trackNode(node, "effect", undefined, inspectEffect);
    return start(node);
}

/** Runs a new reaction for the first time and gives it to the current owner. A reaction whose own function threw is disposed and the error rethrown; one whose first run only flushed another effect's error is kept, given to the owner, and the error rethrown. */
function start(node: Reaction): Disposable
{
    try
    {
        measureRun("Signals", "effect", node);
    }
    catch (error)
    {
        if (node.failed)
        {
            node.dispose();
            throw error;
        }
        adopt(node);
        throw error;
    }
    adopt(node);
    return node;
}

/** Ends the batch a run, a settling, or `batch` opened, then throws what failed: the function's error, the flush's, or both as one `AggregateError`, so a flush error never hides the function's. */
function finish(failed: boolean, failure: unknown): void
{
    try
    {
        endBatch();
    }
    catch (flushError)
    {
        if (failed)
        {
            throw new AggregateError([failure, flushError], "zerolith: the function threw, and so did an effect its writes triggered", { cause: flushError });
        }
        throw flushError;
    }
    if (failed)
    {
        throw failure;
    }
}

/** True for a promise or another thenable, which an effect function must not return. */
function isThenable(value: unknown): boolean
{
    return value !== null && typeof value === "object" && typeof (value as { then?: unknown }).then === "function";
}

/** Applies several writes and runs the affected effects once, after `fn` returns. */
export function batch<T>(fn: () => T): T
{
    if (batchDepth > 0)
    {
        return fn();
    }
    batchDepth++;
    let result: T | undefined;
    let failure: unknown;
    let failed = false;
    try
    {
        result = fn();
    }
    catch (caught)
    {
        failure = caught;
        failed = true;
    }
    finish(failed, failure);
    return result as T;
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
    const created = new OwnerScope(isInternal());
    if (!detached)
    {
        adopt(created);
    }
    return created;
}

/**
 * An owner as one object, its children and its methods together, so
 * creating one allocates once. Internal to the runtime packages, which
 * extend it for an object that also owns what it creates, as a row of a
 * keyed list does.
 */
export class OwnerScope implements Owner, OwnerNode, Child
{
    children: Child | undefined = undefined;
    previous: Child | undefined = undefined;
    private readonly inside: boolean;

    constructor(inside: boolean)
    {
        this.inside = inside;
    }

    run<T>(fn: () => T): T
    {
        const previousOwner = own(this);
        const previousConsumer = consumer;
        consumer = undefined;
        try
        {
            return this.inside ? internal(fn) : fn();
        }
        finally
        {
            owner = previousOwner;
            consumer = previousConsumer;
        }
    }

    dispose(): void
    {
        const children = this.children;
        this.children = undefined;
        if (children !== undefined)
        {
            disposeAll(children);
        }
    }
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

/** A value a part of the application provides to everything created inside it, read with no prop passed through each level. */
export interface Context<T>
{
    /** Runs `fn` with `value` provided, and returns what it returns: the components it calls, and the effects, rows, and branches they create, read `value`, then and whenever they run later. */
    provide<R>(value: T, fn: () => R): R;
    /** The value the nearest `provide` around the running code gives, or the context's initial value when none does. */
    read(): T;
}

/**
 * Creates a context whose `read()` returns `initial` until a `provide`
 * around the running code gives another value. Read it while a component
 * runs, as its props are: an event handler, a timer, or the code after an
 * `await` runs outside the component and reads the initial value.
 */
export function context<T>(initial: T): Context<T>
{
    const created: Context<T> = {
        provide<R>(value: T, fn: () => R): R
        {
            frames ??= new WeakMap();
            const previous = frame;
            frame = { context: created, value, parent: previous, guard: previous?.guard };
            try
            {
                return fn();
            }
            finally
            {
                frame = previous;
            }
        },
        read(): T
        {
            for (let at = frame; at !== undefined; at = at.parent)
            {
                if (at.context === created)
                {
                    return at.value as T;
                }
            }
            return initial;
        }
    };
    return created;
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
    adopt({ dispose: fn, previous: undefined });
}

/** True inside an effect, a scope, or a component's setup, where `onDispose` registers a cleanup; false in plain code, where nothing would run it. */
export function hasOwner(): boolean
{
    return owner !== undefined;
}
