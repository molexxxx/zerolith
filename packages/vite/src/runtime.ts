/**
 * The browser side of the plugin. The rewrite the plugin applies in
 * development routes component exports and `render` calls through these
 * functions, so a changed module swaps its components in place and renders
 * the roots again while named signals keep their values. Nothing here runs
 * in a production build, which the plugin leaves untouched.
 */
import * as core from "zerolith";
import { type DevtoolsHook, devtoolsSaveRestore } from "zerolith/internal";

/** The part of `import.meta.hot` the runtime relies on: the object that survives a module's replacement. */
export interface HotContext
{
    readonly data: Record<string, unknown>;
}

type AnyFunction = (this: unknown, ...args: never[]) => unknown;

interface Entry
{
    impl: AnyFunction;
    proxy: AnyFunction;
}

interface Mounted
{
    factory: () => unknown;
    root: core.Root;
    /** Mounted after the last `save()`, so the module that owns it already rendered the current version. */
    fresh: boolean;
}

const REGISTRY = "zerolith";
const mounted: Map<Element | DocumentFragment, Mounted> = new Map();

/**
 * Registers a component under its module's hot context and returns the
 * proxy that stands in for it. The proxy is created once per module and
 * name and kept in `hot.data`, so importers that are not re-executed keep
 * calling the latest version. Without a hot context the function itself
 * is returned.
 */
export function component<T extends AnyFunction>(hot: HotContext | undefined, name: string, impl: T): T
{
    if (hot === undefined)
    {
        return impl;
    }
    let registry = hot.data[REGISTRY] as Map<string, Entry> | undefined;
    if (registry === undefined)
    {
        registry = new Map();
        hot.data[REGISTRY] = registry;
    }
    const existing = registry.get(name);
    if (existing !== undefined)
    {
        existing.impl = impl;
        return existing.proxy as T;
    }
    const entry: Entry = {
        impl,
        proxy: function (this: unknown, ...args: never[]): unknown
        {
            return entry.impl.apply(this, args);
        }
    };
    Object.defineProperties(entry.proxy, {
        name: { value: name, configurable: true },
        length: { value: impl.length, configurable: true }
    });
    registry.set(name, entry);
    return entry.proxy as T;
}

function unmount(container: Element | DocumentFragment, entry: Mounted): void
{
    if (mounted.get(container) === entry)
    {
        mounted.delete(container);
    }
    entry.root.dispose();
}

/**
 * Renders what `factory` returns into `container` and remembers the factory,
 * so the root can be rendered again after an update. A second root mounted
 * into the same container replaces the first, which is what happens when the
 * entry module itself is re-executed.
 */
export function render(factory: () => unknown, target: core.MountTarget): core.Root
{
    const previous = element(target);
    if (previous !== null)
    {
        mounted.get(previous)?.root.dispose();
    }
    const root = core.render(factory(), target);
    const { container } = root;
    const entry: Mounted = { factory, root, fresh: true };
    mounted.set(container, entry);
    return { container, dispose: () => unmount(container, entry) };
}

/** The `hydrate` counterpart of `render`: hydrates once, then re-renders on updates. */
export function hydrate(factory: () => unknown, target: core.MountTarget): core.HydrateResult
{
    const previous = element(target);
    if (previous !== null)
    {
        mounted.get(previous)?.root.dispose();
    }
    const result = core.hydrate(factory(), target);
    const { container } = result;
    const entry: Mounted = { factory, root: result, fresh: true };
    mounted.set(container, entry);
    return { container, mismatches: result.mismatches, dispose: () => unmount(container, entry) };
}

/** The element a target names when it exists; `core.render` reports a selector that matches nothing. */
function element(target: core.MountTarget): Element | DocumentFragment | null
{
    return typeof target === "string" ? document.querySelector(target) : target;
}

/**
 * Saves the value of every named state signal so the signals created by the
 * next render take them over. The plugin wires this to `import.meta.hot.dispose`,
 * which runs just before a module's new version is evaluated.
 */
export function save(): void
{
    for (const entry of mounted.values())
    {
        entry.fresh = false;
    }
    const hook = (globalThis as { __ZEROLITH_DEVTOOLS__?: DevtoolsHook }).__ZEROLITH_DEVTOOLS__;
    if (hook === undefined)
    {
        return;
    }
    const state: Record<string, unknown> = {};
    for (const node of hook.nodes())
    {
        if (node.kind === "state" && node.name !== undefined && !node.internal && "value" in node)
        {
            state[node.name] = node.value;
        }
    }
    devtoolsSaveRestore(state);
}

/**
 * Renders every recorded root again with its factory and then drops any
 * saved values no signal claimed. The plugin wires this to
 * `import.meta.hot.accept`, which runs after the module's new version has
 * been evaluated and its components re-registered. A root mounted since the
 * last `save()` was rendered by that evaluation itself, when the entry
 * module is the one that changed, and is left as it is.
 */
export function accept(): void
{
    for (const [container, entry] of mounted)
    {
        if (entry.fresh)
        {
            entry.fresh = false;
            continue;
        }
        const view = entry.factory();
        entry.root.dispose();
        entry.root = core.render(view, container);
    }
    devtoolsSaveRestore({});
}
