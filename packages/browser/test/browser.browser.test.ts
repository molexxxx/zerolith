import { afterEach, describe, expect, it, vi } from "vitest";
import { ZerolithError, effect, scope, signal } from "zerolith";
import { inView, online, size, visible, windowSize } from "@zerolith/browser";
import { pretend, restorePretended } from "./helpers.ts";

const added: Element[] = [];

afterEach(() =>
{
    restorePretended();
    for (const element of added.splice(0))
    {
        element.remove();
    }
    vi.restoreAllMocks();
});

/** Adds a block with `style` to the page, removed when the test ends. */
function block(style: string): HTMLElement
{
    const element = document.createElement("div");
    element.setAttribute("style", style);
    document.body.append(element);
    added.push(element);
    return element;
}

/** Waits until `check` passes, for an observer to have reported. */
function settled(check: () => void): Promise<void>
{
    return vi.waitFor(check, { timeout: 2000, interval: 10 });
}

/** Waits `ms` milliseconds, for an observer that should not report. */
function after(ms: number): Promise<void>
{
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The code of the ZerolithError `fn` throws. */
function codeOf(fn: () => unknown): string | undefined
{
    try
    {
        fn();
    }
    catch (error)
    {
        if (error instanceof ZerolithError)
        {
            return error.diagnostic.code;
        }
        throw error;
    }
    return undefined;
}

describe("online", () =>
{
    it("says whether the browser is online, follows the events, and is one signal for the page", () =>
    {
        const isOnline = online();
        expect(online()).toBe(isOnline);
        expect(isOnline.get()).toBe(navigator.onLine);
        pretend(navigator, "onLine", false);
        dispatchEvent(new Event("offline"));
        expect(isOnline.get()).toBe(false);
        pretend(navigator, "onLine", true);
        dispatchEvent(new Event("online"));
        expect(isOnline.get()).toBe(true);
    });
});

describe("visible", () =>
{
    it("says whether the page is visible, follows visibilitychange, and is one signal for the page", () =>
    {
        const isVisible = visible();
        expect(visible()).toBe(isVisible);
        expect(isVisible.get()).toBe(true);
        pretend(document, "visibilityState", "hidden");
        document.dispatchEvent(new Event("visibilitychange"));
        expect(isVisible.get()).toBe(false);
        pretend(document, "visibilityState", "visible");
        document.dispatchEvent(new Event("visibilitychange"));
        expect(isVisible.get()).toBe(true);
    });
});

describe("windowSize", () =>
{
    it("gives the window's inner size, follows resize, and skips a resize to the same size", () =>
    {
        const viewport = windowSize();
        expect(windowSize()).toBe(viewport);
        expect(viewport.get()).toEqual({ width: innerWidth, height: innerHeight });
        let runs = 0;
        const stop = effect(() =>
        {
            viewport.get();
            runs += 1;
        });
        pretend(window, "innerWidth", 333);
        dispatchEvent(new Event("resize"));
        expect(viewport.get().width).toBe(333);
        expect(runs).toBe(2);
        dispatchEvent(new Event("resize"));
        expect(runs).toBe(2);
        stop();
    });
});

describe("size", () =>
{
    it("measures an element's content box now and follows its resizes until the owner is disposed", async () =>
    {
        const box = block("width: 100px; height: 50px; padding: 10px");
        const handle = scope(() => size(box));
        expect(handle.value.get()).toEqual({ width: 100, height: 50 });
        box.style.width = "150px";
        await settled(() => expect(handle.value.get()).toEqual({ width: 150, height: 50 }));
        handle.dispose();
        box.style.width = "200px";
        await after(100);
        expect(handle.value.get().width).toBe(150);
    });

    it("is no size for an element not in the document or without a box, until the observer reports one", async () =>
    {
        const loose = document.createElement("div");
        loose.setAttribute("style", "width: 30px; height: 20px; padding: 5px");
        const handle = scope(() => size(loose));
        expect(handle.value.get()).toEqual({ width: 0, height: 0 });
        document.body.append(loose);
        added.push(loose);
        await settled(() => expect(handle.value.get()).toEqual({ width: 30, height: 20 }));
        const hidden = block("display: none; width: 30px; height: 20px; padding: 10px");
        expect(scope(() => size(hidden)).value.get()).toEqual({ width: 0, height: 0 });
        handle.dispose();
    });

    it("follows the element a ref signal holds, and is no size while it holds none", async () =>
    {
        const unobserve = vi.spyOn(ResizeObserver.prototype, "unobserve");
        const target = signal<Element | undefined>(undefined);
        const handle = scope(() => size(target));
        expect(handle.value.get()).toEqual({ width: 0, height: 0 });
        const first = block("width: 80px; height: 40px");
        target.set(first);
        expect(handle.value.get()).toEqual({ width: 80, height: 40 });
        const second = block("width: 60px; height: 30px");
        target.set(second);
        expect(handle.value.get()).toEqual({ width: 60, height: 30 });
        expect(unobserve).toHaveBeenCalledWith(first);
        await after(50);
        first.style.width = "90px";
        await after(100);
        expect(handle.value.get()).toEqual({ width: 60, height: 30 });
        second.style.height = "35px";
        await settled(() => expect(handle.value.get().height).toBe(35));
        target.set(undefined);
        expect(handle.value.get()).toEqual({ width: 0, height: 0 });
        handle.dispose();
    });

    it("shares one observer, observing an element once for everyone and letting go with the last", () =>
    {
        const observe = vi.spyOn(ResizeObserver.prototype, "observe");
        const unobserve = vi.spyOn(ResizeObserver.prototype, "unobserve");
        const box = block("width: 20px; height: 10px");
        const first = scope(() => size(box));
        const second = scope(() => size(box));
        expect(observe).toHaveBeenCalledTimes(1);
        first.dispose();
        expect(unobserve).not.toHaveBeenCalled();
        second.dispose();
        expect(unobserve).toHaveBeenCalledWith(box);
    });

    it("lives for the page without an owner", () =>
    {
        expect(size(block("width: 10px; height: 5px")).get()).toEqual({ width: 10, height: 5 });
    });
});

describe("inView", () =>
{
    it("reports whether an element is in the viewport, false until the observer first reports", async () =>
    {
        const near = block("height: 10px");
        const far = block("position: absolute; top: 100000px; height: 10px");
        const handle = scope(() => ({ near: inView(near), far: inView(far) }));
        expect(handle.value.near.get()).toBe(false);
        await settled(() => expect(handle.value.near.get()).toBe(true));
        await after(100);
        expect(handle.value.far.get()).toBe(false);
        handle.dispose();
    });

    it("counts the threshold, so an element taller than the viewport is in view for any part and not for most of it", async () =>
    {
        const tall = block(`position: absolute; top: 0; width: 10px; height: ${innerHeight * 3}px`);
        const handle = scope(() => ({ any: inView(tall), most: inView(tall, { threshold: 0.5 }) }));
        await settled(() => expect(handle.value.any.get()).toBe(true));
        await after(100);
        expect(handle.value.most.get()).toBe(false);
        handle.dispose();
    });

    it("hands the root margin and the threshold to the observer, with no margin by default", () =>
    {
        const inits: (IntersectionObserverInit | undefined)[] = [];
        const Original = IntersectionObserver;
        vi.spyOn(globalThis, "IntersectionObserver").mockImplementation(function (callback: IntersectionObserverCallback, init?: IntersectionObserverInit)
        {
            inits.push(init);
            return new Original(callback, init);
        } as unknown as typeof IntersectionObserver);
        const shown = block("height: 10px");
        const handle = scope(() => [inView(shown), inView(shown, { rootMargin: "200px", threshold: 0.25 })]);
        expect(inits).toEqual([{ threshold: 0 }, { rootMargin: "200px", threshold: 0.25 }]);
        handle.dispose();
    });

    it("fails with a code for a threshold outside 0 to 1 or a root margin the browser refuses", () =>
    {
        const shown = block("height: 10px");
        expect(codeOf(() => inView(shown, { threshold: 1.5 }))).toBe("in_view_options_invalid");
        expect(codeOf(() => inView(shown, { threshold: Number.NaN }))).toBe("in_view_options_invalid");
        expect(codeOf(() => inView(shown, { rootMargin: "20" }))).toBe("in_view_options_invalid");
    });

    it("disconnects with the owner", async () =>
    {
        const disconnect = vi.spyOn(IntersectionObserver.prototype, "disconnect");
        const shown = block("height: 10px");
        const handle = scope(() => ({ plain: inView(shown), most: inView(shown, { rootMargin: "20px", threshold: 0.9 }) }));
        await settled(() => expect(handle.value.plain.get() && handle.value.most.get()).toBe(true));
        handle.dispose();
        expect(disconnect).toHaveBeenCalledTimes(2);
    });

    it("follows the element a ref signal holds, and ignores a report for one it has moved on from", async () =>
    {
        const callbacks: IntersectionObserverCallback[] = [];
        const Original = IntersectionObserver;
        vi.spyOn(globalThis, "IntersectionObserver").mockImplementation(function (callback: IntersectionObserverCallback, init?: IntersectionObserverInit)
        {
            callbacks.push(callback);
            return new Original(callback, init);
        } as unknown as typeof IntersectionObserver);
        const unobserve = vi.spyOn(Original.prototype, "unobserve");
        const target = signal<Element | undefined>(undefined);
        const handle = scope(() => inView(target));
        expect(handle.value.get()).toBe(false);
        const shown = block("height: 10px");
        target.set(shown);
        await settled(() => expect(handle.value.get()).toBe(true));
        const next = block("height: 10px");
        target.set(next);
        expect(handle.value.get()).toBe(false);
        expect(unobserve).toHaveBeenCalledWith(shown);
        callbacks[0]?.([{ target: shown, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
        expect(handle.value.get()).toBe(false);
        callbacks[0]?.([{ target: next, isIntersecting: true } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
        expect(handle.value.get()).toBe(true);
        target.set(undefined);
        expect(handle.value.get()).toBe(false);
        handle.dispose();
    });

    it("lives for the page without an owner", async () =>
    {
        const seen = inView(block("height: 10px"));
        await settled(() => expect(seen.get()).toBe(true));
    });
});
