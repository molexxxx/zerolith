/**
 * Focus management: the trap a dialog needs, the roving tabindex a composite
 * widget needs, and a monitor that tells keyboard focus from pointer focus.
 * The trap and the roving tabindex are `ref` callbacks, so they attach when
 * the element is created and clean up when its template is removed.
 */
import { type ReadableSignal, onDispose, signal } from "zerolith";

const FOCUSABLE = "a[href], area[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"]), [contenteditable=\"true\"], audio[controls], video[controls], details > summary, iframe";

/** The elements inside `root` that take Tab focus, in document order, skipping anything hidden. */
export function focusables(root: Element): HTMLElement[]
{
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0 && element.closest("[inert]") === null);
}

/** Options for `focusTrap`. */
export interface FocusTrapOptions
{
    /** What receives focus on attach: a selector inside the element, an element, or false to leave focus alone. Defaults to the first focusable, or the element itself. */
    initial?: string | HTMLElement | false;
    /** Returns focus to the element that had it before the trap attached. Defaults to true. */
    restore?: boolean;
}

/**
 * A `ref` that keeps Tab and Shift+Tab inside the element, pulls focus back
 * when it lands outside, moves focus in once the element is in the document,
 * and returns it where it came from when the element's template is removed.
 */
export function focusTrap(options: FocusTrapOptions = {}): (element: Element) => void
{
    return (element) =>
    {
        const doc = element.ownerDocument;
        const previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
        const fallback = (): HTMLElement =>
        {
            const first = focusables(element)[0];
            if (first !== undefined)
            {
                return first;
            }
            if (!element.hasAttribute("tabindex"))
            {
                element.setAttribute("tabindex", "-1");
            }
            return element as HTMLElement;
        };
        let disposed = false;
        const initial = options.initial;
        const focusInitial = (): void =>
        {
            if (disposed || !element.isConnected || initial === false)
            {
                return;
            }
            const target = typeof initial === "string" ? element.querySelector<HTMLElement>(initial) ?? fallback() : initial ?? fallback();
            target.focus();
        };
        if (initial !== false)
        {
            if (element.isConnected)
            {
                focusInitial();
            }
            else
            {
                queueMicrotask(focusInitial);
            }
        }
        const onKeydown = (event: Event): void =>
        {
            const key = event as KeyboardEvent;
            if (key.key !== "Tab")
            {
                return;
            }
            const list = focusables(element);
            const first = list[0];
            const last = list.at(-1);
            if (first === undefined || last === undefined)
            {
                key.preventDefault();
                return;
            }
            const active = doc.activeElement;
            if (key.shiftKey && (active === first || !element.contains(active)))
            {
                key.preventDefault();
                last.focus();
            }
            else if (!key.shiftKey && (active === last || !element.contains(active)))
            {
                key.preventDefault();
                first.focus();
            }
        };
        const onFocusIn = (event: Event): void =>
        {
            if (!element.contains(event.target as Node))
            {
                fallback().focus();
            }
        };
        element.addEventListener("keydown", onKeydown);
        doc.addEventListener("focusin", onFocusIn);
        onDispose(() =>
        {
            disposed = true;
            element.removeEventListener("keydown", onKeydown);
            doc.removeEventListener("focusin", onFocusIn);
            if (options.restore !== false && previous !== null && previous.isConnected)
            {
                previous.focus();
            }
        });
    };
}

/** Options for `rovingTabindex`. */
export interface RovingOptions
{
    /** The selector of the items. Defaults to the ARIA roles of composite widgets plus `[data-roving]`. */
    items?: string;
    /** Which arrow keys move: `horizontal` (left and right), `vertical` (up and down), or `both`. Defaults to both. */
    orientation?: "horizontal" | "vertical" | "both";
    /** Wraps from the last item to the first and back. Defaults to true. */
    loop?: boolean;
}

const ROVING_ITEMS = "[data-roving], [role=\"tab\"], [role=\"menuitem\"], [role=\"menuitemcheckbox\"], [role=\"menuitemradio\"], [role=\"option\"], [role=\"radio\"], [role=\"treeitem\"], [role=\"gridcell\"]";

/**
 * A `ref` for a composite widget: exactly one item is in the Tab order, the
 * arrow keys, Home, and End move between items, and the item that was
 * selected or checked starts as the current one.
 */
export function rovingTabindex(options: RovingOptions = {}): (element: Element) => void
{
    const selector = options.items ?? ROVING_ITEMS;
    const orientation = options.orientation ?? "both";
    const loop = options.loop !== false;
    return (element) =>
    {
        const items = (): HTMLElement[] => [...element.querySelectorAll<HTMLElement>(selector)].filter((item) => !item.hasAttribute("disabled") && item.getAttribute("aria-disabled") !== "true");
        let current: HTMLElement | undefined;
        const apply = (next: HTMLElement | undefined): void =>
        {
            const list = items();
            current = next !== undefined && list.includes(next) ? next : list.find((item) => item.getAttribute("aria-selected") === "true" || item.getAttribute("aria-checked") === "true") ?? list[0];
            for (const item of list)
            {
                item.tabIndex = item === current ? 0 : -1;
            }
        };
        const move = (step: number, edge?: "first" | "last"): void =>
        {
            const list = items();
            if (list.length === 0)
            {
                return;
            }
            let index = edge === "first" ? 0 : edge === "last" ? list.length - 1 : list.indexOf(current ?? list[0] as HTMLElement) + step;
            if (index < 0 || index >= list.length)
            {
                if (!loop)
                {
                    return;
                }
                index = (index + list.length) % list.length;
            }
            const target = list[index];
            if (target !== undefined)
            {
                apply(target);
                target.focus();
            }
        };
        const onKeydown = (event: Event): void =>
        {
            const key = event as KeyboardEvent;
            const horizontal = orientation !== "vertical";
            const vertical = orientation !== "horizontal";
            if ((key.key === "ArrowRight" && horizontal) || (key.key === "ArrowDown" && vertical))
            {
                move(1);
            }
            else if ((key.key === "ArrowLeft" && horizontal) || (key.key === "ArrowUp" && vertical))
            {
                move(-1);
            }
            else if (key.key === "Home")
            {
                move(0, "first");
            }
            else if (key.key === "End")
            {
                move(0, "last");
            }
            else
            {
                return;
            }
            key.preventDefault();
        };
        const onFocusIn = (event: Event): void =>
        {
            const target = (event.target as Element).closest<HTMLElement>(selector);
            if (target !== null && element.contains(target))
            {
                apply(target);
            }
        };
        apply(undefined);
        const observer = new MutationObserver(() => apply(current));
        observer.observe(element, { childList: true, subtree: true });
        element.addEventListener("keydown", onKeydown);
        element.addEventListener("focusin", onFocusIn);
        onDispose(() =>
        {
            observer.disconnect();
            element.removeEventListener("keydown", onKeydown);
            element.removeEventListener("focusin", onFocusIn);
        });
    };
}

/** How the element that has focus got it. */
export type FocusOrigin = "keyboard" | "pointer" | "touch" | "program";

/** What `focusOrigin` returns. */
export interface FocusOriginMonitor
{
    /** The origin of the current focus, or null while nothing in the document has focus. */
    readonly origin: ReadableSignal<FocusOrigin | null>;
    /** Removes the listeners and the attribute. */
    dispose(): void;
}

/**
 * Watches how focus arrives, the way Angular CDK's focus monitor does: a key
 * pressed before focus moves means keyboard, a pointer pressed means pointer
 * or touch, anything else means program. The origin is a signal and a
 * `data-focus-origin` attribute on the root element, so a stylesheet can
 * show focus rings for keyboard users only: `[data-focus-origin="keyboard"] :focus { outline: ... }`.
 */
export function focusOrigin(doc: Document = document): FocusOriginMonitor
{
    const origin = signal<FocusOrigin | null>(null);
    let last: FocusOrigin | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const remember = (value: FocusOrigin): void =>
    {
        last = value;
        clearTimeout(timer);
        timer = setTimeout(() =>
        {
            last = undefined;
        }, 650);
    };
    const onKeydown = (): void => remember("keyboard");
    const onPointerdown = (event: Event): void => remember((event as PointerEvent).pointerType === "touch" ? "touch" : "pointer");
    const onFocusIn = (): void =>
    {
        const value = last ?? "program";
        origin.set(value);
        doc.documentElement.setAttribute("data-focus-origin", value);
    };
    const onFocusOut = (event: Event): void =>
    {
        if ((event as FocusEvent).relatedTarget === null)
        {
            origin.set(null);
            doc.documentElement.removeAttribute("data-focus-origin");
        }
    };
    doc.addEventListener("keydown", onKeydown, true);
    doc.addEventListener("pointerdown", onPointerdown, true);
    doc.addEventListener("focusin", onFocusIn, true);
    doc.addEventListener("focusout", onFocusOut, true);
    return {
        origin,
        dispose(): void
        {
            clearTimeout(timer);
            doc.removeEventListener("keydown", onKeydown, true);
            doc.removeEventListener("pointerdown", onPointerdown, true);
            doc.removeEventListener("focusin", onFocusIn, true);
            doc.removeEventListener("focusout", onFocusOut, true);
            doc.documentElement.removeAttribute("data-focus-origin");
        }
    };
}
