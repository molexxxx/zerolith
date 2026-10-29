import { type View, signal } from "zerolith";

export function Counter({ start, label, children }: { start: number; label: string; children?: unknown }): View
{
    const count = signal(start, { name: "count" });
    return (
        <section data-testid="counter">
            <p data-testid="count">{label}: {count}</p>
            <button data-testid="increment" on:click={() => count.set(count.get() + 1)}>+</button>
            {children}
        </section>
    );
}
