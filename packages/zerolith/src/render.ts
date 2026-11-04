/**
 * Rendering: template instantiation with fine-grained parts. A template is
 * cloned once and each expression binds to one node; a signal in a part
 * subscribes that part alone, so an update touches one text node or
 * attribute and the component function never runs again.
 *
 * Hydration binds the same parts to markup the server rendered instead of
 * cloning: the server wraps every child part's content in comment markers,
 * and the client walks the existing nodes with the template's part indices.
 *
 * This module mounts a view and gathers the renderer's surface; the parts
 * live under render/: the view types in view.ts, the hydration markers in
 * markers.ts, template instances and child parts in instance.ts, element
 * parts in attributes.ts, and the directives in each.ts and when.ts.
 */
import { measure, trackRoot, untrackRoot } from "./devtools.js";
import { fail } from "./diagnostics.js";
import { ChildPart } from "./render/instance.js";
import { type HydrationMismatch, collect, firstStart, matchingEnd, mismatch } from "./render/markers.js";
import type { Renderable } from "./render/view.js";
import { createOwner } from "./signals.js";

export type { KeyOf, RowOf } from "./render/each.js";
export { each } from "./render/each.js";
export type { HydrationMismatch } from "./render/markers.js";
export { PART_END, PART_START, hasServerMarkup } from "./render/markers.js";
export type { RawView, Renderable, TemplateView, View } from "./render/view.js";
export { VIEW, directiveWrapsBranch, html, isDirective, isRawHtml, isTemplate, resolveDirective, unsafeHtml } from "./render/view.js";
export { when } from "./render/when.js";

/** The handle returned by `render()`. */
export interface Root
{
    /** The element or fragment the view was rendered into. */
    readonly container: Element | DocumentFragment;
    /** Removes everything rendered and disposes every effect it created. */
    dispose(): void;
}

/** The handle returned by `hydrate()`. */
export interface HydrateResult extends Root
{
    /** Every disagreement found; each one was repaired by rendering on the client. */
    readonly mismatches: readonly HydrationMismatch[];
}

/** Where a view mounts: an element or fragment, or a CSS selector for one element in the document. */
export type MountTarget = Element | DocumentFragment | string;

/** The element behind a mount target; a selector that matches nothing is a `mount_target_missing` error. */
function resolveTarget(target: MountTarget): Element | DocumentFragment
{
    if (typeof target !== "string")
    {
        return target;
    }
    const element = document.querySelector(target);
    if (element === null)
    {
        throw fail("mount_target_missing", { selector: target });
    }
    return element;
}

/**
 * The view `render`, `hydrate`, or `renderToString` was given, with a
 * function that returns the view called under the caller's owner. A
 * function that returns another such function, as a build tool's wrapper
 * around `() => App()` does, is called once more. A function that takes
 * parameters is a component passed instead of called, which fails with
 * `mount_component_uncalled` rather than running without its props.
 */
export function produce(view: unknown): unknown
{
    let value = view;
    for (let depth = 0; depth < 2 && typeof value === "function"; depth++)
    {
        if (value.length > 0)
        {
            throw fail("mount_component_uncalled", { name: value.name === "" ? "anonymous" : value.name });
        }
        value = (value as () => unknown)();
    }
    return value;
}

/**
 * Renders a view at the end of `target`, an element or a selector for one,
 * and returns a handle to dispose it. Given a function that returns the
 * view, as in `render(() => App(), "#app")`, it calls the function inside
 * the root's owner, so effects and `onDispose` cleanups the component
 * registers belong to the root and end with `dispose()`.
 */
export function render(view: Renderable | (() => Renderable), target: MountTarget): Root
{
    const container = resolveTarget(target);
    const anchor = document.createComment("");
    container.append(anchor);
    const part = new ChildPart(anchor);
    const owner = createOwner();
    try
    {
        measure("Render", "render", () =>
        {
            owner.run(() =>
            {
                part.set(produce(view));
            });
        });
    }
    catch (error)
    {
        owner.dispose();
        part.destroy();
        throw error;
    }
    const root: Root = {
        container,
        dispose(): void
        {
            untrackRoot(root);
            owner.dispose();
            part.destroy();
        }
    };
    trackRoot(root, container, "render");
    return root;
}

/**
 * Attaches a view to markup the server rendered into `target`, an element
 * or a selector for one, with `renderToString`, reusing the nodes and
 * binding signals, listeners, properties, and refs. A disagreement in the
 * nodes, the text, or the structure is repaired on the client and returned
 * in `mismatches`; an attribute, a property, or raw markup the server wrote
 * differently is rewritten without a report. Without server-rendered markup
 * it falls back to `render`. As with `render`, a function that returns the
 * view is called inside the root's owner.
 */
export function hydrate(view: Renderable | (() => Renderable), target: MountTarget): HydrateResult
{
    const container = resolveTarget(target);
    const found: HydrationMismatch[] = [];
    const start = firstStart(container);
    const end = start === undefined ? undefined : matchingEnd(start);
    const owner = createOwner();
    let part: ChildPart;
    let rendered: ChildPart | undefined;
    const previous = collect(found);
    try
    {
        measure("Render", "hydrate", () =>
        {
            if (start === undefined || end === undefined)
            {
                mismatch("root", "server-rendered markup", "");
                const anchor = document.createComment("");
                container.append(anchor);
                part = new ChildPart(anchor);
                rendered = part;
                owner.run(() =>
                {
                    part.set(produce(view));
                });
            }
            else
            {
                const cursor = start.nextSibling ?? end;
                part = new ChildPart(end);
                owner.run(() =>
                {
                    part.set(produce(view), cursor);
                });
            }
        });
    }
    catch (error)
    {
        owner.dispose();
        rendered?.destroy();
        throw error;
    }
    finally
    {
        collect(previous);
    }
    const result: HydrateResult = {
        container,
        mismatches: found,
        dispose(): void
        {
            untrackRoot(result);
            owner.dispose();
            part.destroy();
            start?.remove();
        }
    };
    trackRoot(result, container, "hydrate");
    return result;
}
