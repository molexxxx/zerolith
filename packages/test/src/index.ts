/**
 * @zerolith/test: helpers for testing zerolith views in any runner that
 * gives them a DOM. Mount with automatic cleanup, settle async work, check
 * a view's server markup against hydration, and find the accessibility
 * defects a test can catch.
 */
import { type HydrationMismatch, type Root, hydrate, render } from "zerolith";
import { renderToString } from "zerolith/ssr";

/** What `mount` returns. */
export interface Mounted
{
    /** The element the view was rendered into. */
    readonly container: HTMLElement;
    readonly root: Root;
    /** Disposes the view and removes the container; `cleanup` does the same for every mount. */
    unmount(): void;
}

/** Options for `mount`. */
export interface MountOptions
{
    /** Renders into this element instead of a new `div`. */
    container?: HTMLElement;
    /** Appends a new container to `document.body`. Defaults to true; layout and focus need it. */
    attach?: boolean;
}

const mounted: Mounted[] = [];

/** Renders a view into a container and remembers it for `cleanup`. */
export function mount(view: unknown, options: MountOptions = {}): Mounted
{
    const container = options.container ?? document.createElement("div");
    if (options.container === undefined && options.attach !== false)
    {
        document.body.append(container);
    }
    const root = render(view, container);
    const entry: Mounted = {
        container,
        root,
        unmount(): void
        {
            const index = mounted.indexOf(entry);
            if (index !== -1)
            {
                mounted.splice(index, 1);
            }
            root.dispose();
            if (options.container === undefined)
            {
                container.remove();
            }
        }
    };
    mounted.push(entry);
    return entry;
}

/** Unmounts everything `mount` created, newest first. Register it as the runner's after-each hook. */
export function cleanup(): void
{
    for (const entry of mounted.toReversed())
    {
        entry.unmount();
    }
}

/**
 * Waits for the asynchronous work a test started: resources, lazy routes,
 * and anything scheduled with promises or a timer of zero. Effects run
 * synchronously when a signal changes, so they need no settling.
 */
export function settle(rounds = 2): Promise<void>
{
    let chain = Promise.resolve();
    for (let round = 0; round < rounds; round++)
    {
        chain = chain.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    }
    return chain;
}

/**
 * Renders `view()` with the server renderer, hydrates a second `view()` over
 * that markup, and returns every disagreement. An empty array means the
 * component hydrates cleanly; the container is discarded afterwards.
 */
export function hydrationMismatches(view: () => unknown): HydrationMismatch[]
{
    const container = document.createElement("div");
    container.innerHTML = renderToString(view());
    const result = hydrate(view(), container);
    const mismatches = [...result.mismatches];
    result.dispose();
    return mismatches;
}

/** The accessibility checks `accessibilityIssues` runs. */
export type AccessibilityCode = "image_without_alt" | "control_without_label" | "button_without_name" | "link_without_name" | "frame_without_title";

/** One defect found by `accessibilityIssues`. */
export interface AccessibilityIssue
{
    readonly code: AccessibilityCode;
    readonly element: Element;
}

function hasName(element: Element): boolean
{
    const label = element.getAttribute("aria-label") ?? "";
    if (label.trim() !== "" || element.hasAttribute("aria-labelledby") || (element.getAttribute("title") ?? "").trim() !== "")
    {
        return true;
    }
    if ((element.textContent ?? "").trim() !== "")
    {
        return true;
    }
    return [...element.querySelectorAll("img[alt]")].some((image) => (image.getAttribute("alt") ?? "").trim() !== "");
}

function isLabeled(control: Element): boolean
{
    if (hasName(control) || control.closest("label") !== null)
    {
        return true;
    }
    const id = control.getAttribute("id");
    return id !== null && id !== "" && control.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`) !== null;
}

/**
 * Finds the defects that need no accessibility tree to detect, the ones the
 * WebAIM Million finds on most home pages: images without `alt`, form
 * controls without a label, buttons and links without an accessible name,
 * and frames without a title. It is a floor, not a conformance check.
 */
export function accessibilityIssues(container: ParentNode): AccessibilityIssue[]
{
    const issues: AccessibilityIssue[] = [];
    for (const image of container.querySelectorAll("img:not([alt])"))
    {
        issues.push({ code: "image_without_alt", element: image });
    }
    for (const control of container.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea"))
    {
        if (!isLabeled(control))
        {
            issues.push({ code: "control_without_label", element: control });
        }
    }
    for (const button of container.querySelectorAll("button, input[type=submit], input[type=button], input[type=reset], input[type=image], [role=button]"))
    {
        const named = button instanceof HTMLInputElement ? (button.value.trim() !== "" || (button.getAttribute("alt") ?? "").trim() !== "" || hasName(button)) : hasName(button);
        if (!named)
        {
            issues.push({ code: "button_without_name", element: button });
        }
    }
    for (const anchor of container.querySelectorAll("a[href]"))
    {
        if (!hasName(anchor))
        {
            issues.push({ code: "link_without_name", element: anchor });
        }
    }
    for (const frame of container.querySelectorAll("iframe"))
    {
        if ((frame.getAttribute("title") ?? "").trim() === "")
        {
            issues.push({ code: "frame_without_title", element: frame });
        }
    }
    return issues;
}
