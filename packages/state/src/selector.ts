/**
 * A selector over a signal: one boolean signal per key, true for the key
 * the source holds, so a selection among many rows updates two rows
 * rather than every row's own comparison.
 */
import { type ReadableSignal, type Signal, effect, signal, untracked } from "zerolith";

/** True when `Map` would treat `a` and `b` as one key. */
function same(a: unknown, b: unknown): boolean
{
    return a === b || (a !== a && b !== b);
}

/**
 * A per-key view of `source`: `selected(key)` is a signal that is true
 * while `source` holds `key`, and a change of `source` updates the two
 * keys concerned alone, so a list of a thousand rows that each bind
 * `selected(row.id)` runs two bindings on a selection, not a thousand
 * comparisons. Keys are compared as `Map` keys are. A key's signal is
 * shared by everyone who asks for it, and the selector keeps no hold of
 * its own: the signal lives while a view reads it and goes with the row
 * that did.
 */
export function selector<T>(source: ReadableSignal<T>): (key: T) => ReadableSignal<boolean>
{
    const flags = new Map<T, WeakRef<Signal<boolean>>>();
    const gone = new FinalizationRegistry<T>((key) =>
    {
        if (flags.get(key)?.deref() === undefined)
        {
            flags.delete(key);
        }
    });
    let current = untracked(() => source.get());
    effect(() =>
    {
        const next = source.get();
        if (same(next, current))
        {
            return;
        }
        flags.get(current)?.deref()?.set(false);
        flags.get(next)?.deref()?.set(true);
        current = next;
    });
    return (key) =>
    {
        let flag = flags.get(key)?.deref();
        if (flag === undefined)
        {
            flag = signal(same(key, current));
            flags.set(key, new WeakRef(flag));
            gone.register(flag, key);
        }
        return flag;
    };
}
