/**
 * @zerolith/test: helpers for testing zerolith views in any runner that
 * gives them a DOM. Mount with automatic cleanup, settle async work, check
 * a view's server markup against hydration, and find the accessibility
 * defects a test can catch.
 */
import { type HydrationMismatch, type Renderable, type Root, hydrate, render } from "zerolith";
import { renderToString } from "zerolith/ssr";

/** What `mount` returns. */
export interface Mounted
{
    /** The element the view was rendered into. */
    readonly container: HTMLElement;
    /** The root `render` returned for the view; `unmount` disposes it. */
    readonly root: Root;
    /** Disposes the view and removes the container; `cleanup` does the same for every mount. */
    unmount(): void;
}

/** Options for `mount`. */
export interface MountOptions
{
    /** Renders into this element instead of a new `div`. */
    container?: HTMLElement;
    /** Appends a new container to `document.body`. Defaults to true; layout and focus need it. Ignored with `container`. */
    attach?: boolean;
}

const mounted: Mounted[] = [];

/**
 * Renders a view into a container and remembers it for `cleanup`. Given a
 * function that returns the view, as `mount(() => Page())`, it hands the
 * function to `render`, which calls it inside the root's owner, so a
 * component that registers cleanups with `onDispose` mounts as it is, and
 * its cleanups run when the view is unmounted. A component that takes
 * props, passed uncalled, fails with `mount_component_uncalled`, as
 * `render` does. A container `mount` created is removed even when
 * rendering throws.
 */
export function mount(view: Renderable | (() => Renderable), options: MountOptions = {}): Mounted
{
    const container = options.container ?? document.createElement("div");
    if (options.container === undefined && options.attach !== false)
    {
        document.body.append(container);
    }
    let root: Root;
    try
    {
        root = render(view, container);
    }
    catch (error)
    {
        if (options.container === undefined)
        {
            container.remove();
        }
        throw error;
    }
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
            try
            {
                root.dispose();
            }
            finally
            {
                if (options.container === undefined)
                {
                    container.remove();
                }
            }
        }
    };
    mounted.push(entry);
    return entry;
}

/** Unmounts everything `mount` created, newest first, each even when another's cleanup throws, and then throws the first error. Register it as the runner's after-each hook. */
export function cleanup(): void
{
    const errors: unknown[] = [];
    for (const entry of mounted.toReversed())
    {
        try
        {
            entry.unmount();
        }
        catch (error)
        {
            errors.push(error);
        }
    }
    if (errors.length > 0)
    {
        throw errors[0];
    }
}

/**
 * Waits `rounds` turns of the timer queue, two by default: enough for
 * promise chains, a resource whose loader resolves at once, and zero-delay
 * timers. Effects run synchronously when a signal changes, so they need no
 * settling. For a module import or a request, wait on its result with the
 * runner's `waitFor` instead.
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
 * Renders `view` with the server renderer, hydrates it over that markup,
 * and returns every disagreement. Each pass calls `view` inside its own
 * owner, so the effects and `onDispose` cleanups a component registers end
 * before the helper returns. An empty array means the component hydrates
 * cleanly; the container is discarded afterwards.
 */
export function hydrationMismatches(view: () => Renderable): HydrationMismatch[]
{
    const container = document.createElement("div");
    container.innerHTML = renderToString(view);
    const result = hydrate(view, container);
    const mismatches = [...result.mismatches];
    result.dispose();
    return mismatches;
}

/** The accessibility checks `accessibilityIssues` runs. */
export type AccessibilityCode = "image_without_alt" | "control_without_label" | "button_without_name" | "link_without_name" | "frame_without_title";

/** One defect found by `accessibilityIssues`. */
export interface AccessibilityIssue
{
    /** Which check the element failed, such as `image_without_alt`. */
    readonly code: AccessibilityCode;
    /** The element that failed the check, found inside the container passed to `accessibilityIssues`. */
    readonly element: Element;
}

/** True when an element has an accessible name from an attribute: `aria-label`, `aria-labelledby`, or `title`. */
function namedByAttribute(element: Element): boolean
{
    return (element.getAttribute("aria-label") ?? "").trim() !== "" || element.hasAttribute("aria-labelledby") || (element.getAttribute("title") ?? "").trim() !== "";
}

/** The text an element shows to assistive technology: its text content, leaving out every `aria-hidden="true"` subtree. */
function exposedText(element: Element): string
{
    let text = "";
    for (const node of element.childNodes)
    {
        if (node.nodeType === Node.TEXT_NODE)
        {
            text += node.textContent ?? "";
        }
        else if (node instanceof Element && node.getAttribute("aria-hidden") !== "true")
        {
            text += exposedText(node);
        }
    }
    return text;
}

function hasName(element: Element): boolean
{
    if (namedByAttribute(element) || exposedText(element).trim() !== "")
    {
        return true;
    }
    return [...element.querySelectorAll("img[alt]")].some((image) => (image.getAttribute("alt") ?? "").trim() !== "" && image.closest("[aria-hidden=\"true\"]") === null);
}

function isLabeled(control: Element): boolean
{
    if (hasName(control) || control.closest("label") !== null)
    {
        return true;
    }
    const id = control.getAttribute("id");
    const tree = control.getRootNode() as ParentNode;
    return id !== null && id !== "" && [...tree.querySelectorAll("label[for]")].some((label) => (label as HTMLLabelElement).htmlFor === id);
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
        if (!namedByAttribute(frame))
        {
            issues.push({ code: "frame_without_title", element: frame });
        }
    }
    return issues;
}
