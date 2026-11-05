/**
 * The page's own state as signals shared by everyone who asks: whether it
 * is online, whether it is visible, and the window's size.
 */
import { type ReadableSignal, signal } from "zerolith";
import { NONE, type Size, sameSize } from "./size.js";

let onlineSignal: ReadableSignal<boolean> | undefined;
let visibleSignal: ReadableSignal<boolean> | undefined;
let windowSizeSignal: ReadableSignal<Size> | undefined;

/** A signal of what `read` gives, read again on each of `events` from `target`; a still signal of `still` where there is no target, as on the server. */
function following<T>(target: EventTarget | undefined, events: readonly string[], read: () => T, still: T, equals?: (a: T, b: T) => boolean): ReadableSignal<T>
{
    if (target === undefined)
    {
        return signal(still);
    }
    const value = signal(read(), equals === undefined ? undefined : { equals });
    for (const event of events)
    {
        target.addEventListener(event, () => value.set(read()));
    }
    return value;
}

/** Whether the browser is online, as `navigator.onLine` says, following the `online` and `offline` events; one signal for the page, started when first asked for, and true where there is no browser. */
export function online(): ReadableSignal<boolean>
{
    onlineSignal ??= following(typeof window === "undefined" ? undefined : window, ["online", "offline"], () => navigator.onLine, true);
    return onlineSignal;
}

/** Whether the page is visible, following `visibilitychange`; one signal for the page, started when first asked for, and true where there is no document. */
export function visible(): ReadableSignal<boolean>
{
    visibleSignal ??= following(typeof document === "undefined" ? undefined : document, ["visibilitychange"], () => document.visibilityState === "visible", true);
    return visibleSignal;
}

/** The window's inner size, following `resize`, which a browser fires once per frame; one signal for the page, started when first asked for, and no size where there is no window. */
export function windowSize(): ReadableSignal<Size>
{
    windowSizeSignal ??= following(typeof window === "undefined" ? undefined : window, ["resize"], () => ({ width: window.innerWidth, height: window.innerHeight }), NONE, sameSize);
    return windowSizeSignal;
}
