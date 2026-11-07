// What when() accepts as its condition and refuses; `tsc` is the test, so a line marked ts-expect-error must fail to compile and every other line must pass.
import { type View, computed, html, signal, when } from "zerolith";

/** Conditions when() accepts: a signal, a computed value, and plain values. */
export function accepted(): View[]
{
    const items = signal<string[]>([]);
    const empty = computed(() => items.get().length === 0);
    return [
        when(empty, () => html`<p>Nothing yet</p>`),
        when(signal(1), () => html`<p>One</p>`, () => html`<p>None</p>`),
        when(true, () => html`<p>Always</p>`),
        when(items.get().length, () => html`<p>Some</p>`),
        when(undefined, () => html`<p>Never</p>`)
    ];
}

/** A function as the condition, which would always count as true. */
export function refused(): View[]
{
    const items = signal<string[]>([]);
    return [
        // @ts-expect-error a function is not a condition; pass the computed value
        when(() => items.get().length === 0, () => html`<p>Nothing yet</p>`)
    ];
}
