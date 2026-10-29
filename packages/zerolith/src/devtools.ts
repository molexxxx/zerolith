// The production build replaces this module with devtools.production.ts,
// whose functions do nothing, so instrumentation costs nothing there.
import type { Diagnostic } from "./diagnostics.js";

/** What a reactive node looks like to an inspector. */
export interface NodeSnapshot
{
    id: number;
    kind: "state" | "computed" | "effect";
    name: string | undefined;
    /** The current value for state and computed nodes; absent for effects and when reading threw. */
    value?: unknown;
    /** How many nodes currently depend on this one. */
    observers: number;
    /** Created while the inspector itself was rendering. */
    internal: boolean;
}

/** A mounted root as the inspector sees it. */
export interface RootSnapshot
{
    id: number;
    kind: "render" | "hydrate";
    container: Node;
    internal: boolean;
}

/** Something the hook announces to subscribers. */
export type DevtoolsEvent =
    | { type: "node"; id: number }
    | { type: "root"; id: number; removed: boolean }
    | { type: "diagnostic"; diagnostic: Diagnostic }
    | { type: "flush"; effects: number };

/** The object published as `globalThis.__ZEROLITH_DEVTOOLS__` in development builds. */
export interface DevtoolsHook
{
    readonly version: number;
    /** Live reactive nodes, oldest first. */
    nodes(): NodeSnapshot[];
    /** Mounted roots. */
    roots(): RootSnapshot[];
    /** The most recent diagnostics, oldest first. */
    diagnostics(): Diagnostic[];
    /** Subscribes to changes; returns an unsubscribe function. */
    subscribe(listener: (event: DevtoolsEvent) => void): () => void;
}

/** Reads a node's state when the inspector asks. It receives the node so it never has to hold it. */
export type Inspect<T extends object> = (node: T) => { value?: unknown; observers: number };

interface TrackedNode
{
    id: number;
    kind: NodeSnapshot["kind"];
    name: string | undefined;
    internal: boolean;
    ref: WeakRef<object>;
    inspect: Inspect<object>;
}

const DIAGNOSTICS_KEPT = 200;

let nextId = 1;
let depth = 0;
let pruneAt = 256;
const nodes: TrackedNode[] = [];
const roots: Map<object, RootSnapshot> = new Map();
const diagnostics: Diagnostic[] = [];
const listeners: Set<(event: DevtoolsEvent) => void> = new Set();

function emit(event: DevtoolsEvent): void
{
    for (const listener of listeners)
    {
        listener(event);
    }
}

function prune(): void
{
    for (let i = nodes.length - 1; i >= 0; i--)
    {
        if (nodes[i]?.ref.deref() === undefined)
        {
            nodes.splice(i, 1);
        }
    }
}

const hook: DevtoolsHook = {
    version: 1,
    nodes()
    {
        prune();
        return nodes.map((node) =>
        {
            const snapshot: NodeSnapshot = { id: node.id, kind: node.kind, name: node.name, observers: 0, internal: node.internal };
            const target = node.ref.deref();
            if (target === undefined)
            {
                return snapshot;
            }
            try
            {
                const state = node.inspect(target);
                snapshot.observers = state.observers;
                if ("value" in state)
                {
                    snapshot.value = state.value;
                }
            }
            catch
            {
                // A computed value that throws is shown without a value.
            }
            return snapshot;
        });
    },
    roots()
    {
        return [...roots.values()];
    },
    diagnostics()
    {
        return [...diagnostics];
    },
    subscribe(listener)
    {
        listeners.add(listener);
        return () =>
        {
            listeners.delete(listener);
        };
    }
};

(globalThis as { __ZEROLITH_DEVTOOLS__?: DevtoolsHook }).__ZEROLITH_DEVTOOLS__ = hook;

/**
 * Records a reactive node, held weakly so discarded state can be collected.
 * `inspect` receives the node and reads its state untracked when the
 * inspector asks; it must not capture the node itself. The registry is
 * pruned of collected nodes each time it doubles.
 */
export function trackNode<T extends object>(node: T, kind: NodeSnapshot["kind"], name: string | undefined, inspect: Inspect<T>): void
{
    const id = nextId++;
    nodes.push({ id, kind, name, internal: depth > 0, ref: new WeakRef(node), inspect: inspect as Inspect<object> });
    if (nodes.length >= pruneAt)
    {
        prune();
        pruneAt = Math.max(256, nodes.length * 2);
    }
    emit({ type: "node", id });
}

/** Records a mounted root. */
export function trackRoot(root: object, container: Node, kind: RootSnapshot["kind"]): void
{
    const id = nextId++;
    roots.set(root, { id, kind, container, internal: depth > 0 });
    emit({ type: "root", id, removed: false });
}

/** Forgets a disposed root. */
export function untrackRoot(root: object): void
{
    const snapshot = roots.get(root);
    if (snapshot !== undefined)
    {
        roots.delete(root);
        emit({ type: "root", id: snapshot.id, removed: true });
    }
}

/** Appends a diagnostic to the feed. */
export function trackDiagnostic(record: Diagnostic): void
{
    diagnostics.push(record);
    if (diagnostics.length > DIAGNOSTICS_KEPT)
    {
        diagnostics.shift();
    }
    emit({ type: "diagnostic", diagnostic: record });
}

/** Announces that a batch flushed `effects` effect runs. */
export function trackFlush(effects: number): void
{
    emit({ type: "flush", effects });
}

/** Runs `fn` with everything it creates marked as belonging to the inspector. */
export function internal<T>(fn: () => T): T
{
    depth++;
    try
    {
        return fn();
    }
    finally
    {
        depth--;
    }
}

/** Times `fn` as an entry on a custom track in the browser's Performance panel. */
export function measure<T>(track: string, name: string, fn: () => T): T
{
    if (typeof performance === "undefined" || typeof performance.measure !== "function")
    {
        return fn();
    }
    const start = performance.now();
    try
    {
        return fn();
    }
    finally
    {
        try
        {
            performance.measure(name, { start, end: performance.now(), detail: { devtools: { dataType: "track-entry", track, trackGroup: "zerolith" } } });
        }
        catch
        {
            // Some runtimes reject the options form; the measurement is only a convenience.
        }
    }
}
