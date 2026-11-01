/**
 * Wheel scrolling for the docs site, eased by Lenis so a wheel step glides
 * to its distance instead of jumping there. The site loads it for a mouse or
 * a trackpad while the reader allows motion; touch and keyboard scrolling
 * stay native. Links to a heading on the same page travel through it and
 * keep the history entry the browser would add, so back and forward still
 * move between headings through the router.
 */
import Lenis from "lenis";

/** The share of the remaining distance each frame covers at 60 Hz; Lenis scales it by the frame's duration, so a faster display draws the same glide in more frames. */
const LERP = 0.15;

let lenis: Lenis | undefined;

/** Whether the wheel gesture being handled is mostly sideways, recorded before Lenis sees the event. */
let sideways = false;

function onWheel(event: WheelEvent): void
{
    sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY);
}

/**
 * Whether an element under the wheel keeps native scrolling: a dialog, a
 * pane that overflows vertically, such as the sidebar, and for a sideways
 * gesture, a pane that overflows horizontally, such as a long code line.
 */
function keepsNativeScroll(node: HTMLElement): boolean
{
    if (node instanceof HTMLDialogElement)
    {
        return true;
    }
    const tall = node.scrollHeight > node.clientHeight + 1;
    const wide = sideways && node.scrollWidth > node.clientWidth + 1;
    if (!tall && !wide)
    {
        return false;
    }
    const style = getComputedStyle(node);
    return (tall && /auto|scroll/.test(style.overflowY)) || (wide && /auto|scroll/.test(style.overflowX));
}

/** Takes over a link to a heading on the page shown, after the router has saved the position of the entry it leaves. */
function onClick(event: MouseEvent): void
{
    if (lenis === undefined || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    {
        return;
    }
    const link = (event.target as Element | null)?.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target !== "" && link.target !== "_self"))
    {
        return;
    }
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || url.hash === "")
    {
        return;
    }
    const target = document.getElementById(url.hash.slice(1)) ?? document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (target === null)
    {
        return;
    }
    event.preventDefault();
    if (url.href === location.href)
    {
        history.replaceState(history.state, "", url.href);
    }
    else
    {
        history.pushState({}, "", url.href);
    }
    if (!target.hasAttribute("tabindex"))
    {
        target.setAttribute("tabindex", "-1");
    }
    target.focus({ preventScroll: true });
    const far = Math.abs(target.getBoundingClientRect().top) > innerHeight * 2;
    lenis.scrollTo(target, { immediate: far });
}

/** Starts easing wheel scrolling; starting twice keeps the one scroller. */
export function start(): void
{
    if (lenis !== undefined)
    {
        return;
    }
    lenis = new Lenis({ autoRaf: true, lerp: LERP, prevent: keepsNativeScroll });
    addEventListener("wheel", onWheel, { capture: true, passive: true });
    document.addEventListener("click", onClick);
}

/** Returns the page to native scrolling. */
export function stop(): void
{
    lenis?.destroy();
    lenis = undefined;
    removeEventListener("wheel", onWheel, { capture: true });
    document.removeEventListener("click", onClick);
}

/** Drops any glide still in flight and takes the page's position as it is, after the router has scrolled for a navigation. */
export function settle(): void
{
    lenis?.stop();
    lenis?.start();
}
