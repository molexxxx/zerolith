/**
 * Whether an element is in view, as a signal kept by an
 * IntersectionObserver.
 */
import { type DiagnosticArgs, type ReadableSignal, ZerolithError, diagnostic, effect, hasOwner, onDispose, signal } from "zerolith";

/** Options for `inView`. */
export interface InViewOptions
{
    /** Space around the viewport that counts as in view, as an IntersectionObserver's `rootMargin`; "200px" starts loading a little ahead of the scroll. */
    rootMargin?: string;
    /** How much of the element must show, from 0 for any part of it to 1 for all of it. Defaults to 0. */
    threshold?: number;
}

/** The error for options an IntersectionObserver refuses. */
function invalid(args: DiagnosticArgs): ZerolithError
{
    return new ZerolithError(diagnostic("in_view_options_invalid", "error", args));
}

/**
 * Whether `target` intersects the viewport, as a signal: the element
 * itself, or the signal a `ref` fills, which follows the element it holds
 * and is false while it holds none. An IntersectionObserver keeps it
 * current; it stops with the enclosing owner when there is one and lives
 * for the page otherwise. The signal is false until the observer first
 * reports, and where there is no observer, as on the server. A threshold
 * outside 0 to 1, or a root margin the browser refuses, fails with
 * `in_view_options_invalid`.
 */
export function inView(target: Element | ReadableSignal<Element | undefined>, options: InViewOptions = {}): ReadableSignal<boolean>
{
    const threshold = options.threshold ?? 0;
    const value = signal(false);
    if (typeof IntersectionObserver === "undefined")
    {
        return value;
    }
    let current: Element | undefined = target instanceof Element ? target : undefined;
    const init: IntersectionObserverInit = { threshold };
    if (options.rootMargin !== undefined)
    {
        init.rootMargin = options.rootMargin;
    }
    let observer: IntersectionObserver;
    try
    {
        observer = new IntersectionObserver((entries) =>
        {
            const entry = entries.findLast((candidate) => candidate.target === current);
            if (entry !== undefined)
            {
                value.set(entry.isIntersecting);
            }
        }, init);
    }
    catch
    {
        throw invalid({ threshold: String(threshold), rootMargin: options.rootMargin ?? "" });
    }
    if (hasOwner())
    {
        onDispose(() => observer.disconnect());
    }
    if (target instanceof Element)
    {
        observer.observe(target);
        return value;
    }
    effect(() =>
    {
        const element = target.get();
        current = element;
        value.set(false);
        if (element === undefined)
        {
            return undefined;
        }
        observer.observe(element);
        return () => observer.unobserve(element);
    });
    return value;
}
