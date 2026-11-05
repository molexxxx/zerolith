/**
 * Signals that follow another in their own time: after a quiet spell, or
 * at most so often.
 */
import { type ReadableSignal, effect, hasOwner, onDispose, signal, untracked } from "zerolith";

/**
 * A signal that follows `source` once it has been quiet for `ms`
 * milliseconds, starting at its current value, so a search runs for the
 * text a reader stopped typing rather than for every keystroke. The
 * pending change is dropped with the enclosing owner when there is one.
 */
export function debounced<T>(source: ReadableSignal<T>, ms: number): ReadableSignal<T>
{
    const value = signal(untracked(() => source.get()));
    let first = true;
    effect(() =>
    {
        const next = source.get();
        if (first)
        {
            first = false;
            return undefined;
        }
        const timer = setTimeout(() => value.set(next), ms);
        return () => clearTimeout(timer);
    });
    return value;
}

/**
 * A signal that follows `source` at most once per `ms` milliseconds: the
 * first change in a window shows at once, and the last one in it shows
 * when the window ends, so a scroll position drives work at a steady rate.
 * A change still pending is dropped when a newer one shows after the
 * window, and with the enclosing owner when there is one.
 */
export function throttled<T>(source: ReadableSignal<T>, ms: number): ReadableSignal<T>
{
    const value = signal(untracked(() => source.get()));
    let last = Number.NEGATIVE_INFINITY;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: T;
    let first = true;
    const clear = (): void =>
    {
        if (timer !== undefined)
        {
            clearTimeout(timer);
            timer = undefined;
        }
    };
    effect(() =>
    {
        const next = source.get();
        if (first)
        {
            first = false;
            return;
        }
        const now = Date.now();
        if (now - last >= ms)
        {
            clear();
            last = now;
            value.set(next);
            return;
        }
        pending = next;
        timer ??= setTimeout(() =>
        {
            timer = undefined;
            last = Date.now();
            value.set(pending);
        }, ms - (now - last));
    });
    if (hasOwner())
    {
        onDispose(clear);
    }
    return value;
}
