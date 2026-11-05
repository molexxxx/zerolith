/**
 * An element's content box as a signal, kept by one ResizeObserver shared
 * by every measured element.
 */
import { type ReadableSignal, effect, hasOwner, onDispose, signal } from "zerolith";

/** A width and a height in CSS pixels. */
export interface Size
{
    /** The width in CSS pixels. */
    readonly width: number;
    /** The height in CSS pixels. */
    readonly height: number;
}

/** No size: what an element has before it is measured, and what the server has. */
export const NONE: Size = { width: 0, height: 0 };

/** True when two sizes are the same, so a resize to the same size changes nothing. */
export function sameSize(a: Size, b: Size): boolean
{
    return a.width === b.width && a.height === b.height;
}

/** Who follows each element's content box, so one observer serves every measured element. */
const listeners = new Map<Element, Set<(box: Size) => void>>();
let observer: ResizeObserver | undefined;

/** Hands each reported element's content box to those following it. */
function report(entries: ResizeObserverEntry[]): void
{
    for (const entry of entries)
    {
        const set = listeners.get(entry.target);
        if (set !== undefined)
        {
            const box = { width: entry.contentRect.width, height: entry.contentRect.height };
            for (const listener of set)
            {
                listener(box);
            }
        }
    }
}

/** Starts `listener` on `element`'s content box through the shared observer and returns what stops it, which unobserves the element once nobody follows it. */
function watch(element: Element, listener: (box: Size) => void): () => void
{
    observer ??= new ResizeObserver(report);
    let set = listeners.get(element);
    if (set === undefined)
    {
        set = new Set();
        listeners.set(element, set);
        observer.observe(element);
    }
    set.add(listener);
    return () =>
    {
        set.delete(listener);
        if (set.size === 0)
        {
            listeners.delete(element);
            observer?.unobserve(element);
        }
    };
}

/** The content box of `element` from its layout now, the client box less the padding, or no size while it is not in the document. */
function contentBox(element: Element): Size
{
    if (!element.isConnected)
    {
        return NONE;
    }
    const style = getComputedStyle(element);
    return {
        width: Math.max(0, element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
        height: Math.max(0, element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))
    };
}

/**
 * The content box of `target` as a signal: the element itself, or the
 * signal a `ref` fills, which measures the element it holds and is no size
 * while it holds none. An element not yet in the document is no size
 * until the observer first reports it. One ResizeObserver, shared by every
 * measured element, keeps the signal current; it stops with the enclosing
 * owner when there is one and lives for the page otherwise. Where there is
 * no observer, as on the server, the signal is no size.
 */
export function size(target: Element | ReadableSignal<Element | undefined>): ReadableSignal<Size>
{
    const value = signal(NONE, { equals: sameSize });
    if (typeof ResizeObserver === "undefined")
    {
        return value;
    }
    const follow = (box: Size): void => value.set(box);
    if (target instanceof Element)
    {
        value.set(contentBox(target));
        const stop = watch(target, follow);
        if (hasOwner())
        {
            onDispose(stop);
        }
        return value;
    }
    effect(() =>
    {
        const element = target.get();
        if (element === undefined)
        {
            value.set(NONE);
            return undefined;
        }
        value.set(contentBox(element));
        return watch(element, follow);
    });
    return value;
}
