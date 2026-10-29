// Executed examples for the templates guide: the same component spelled as JSX.
import { afterEach, describe, expect, it } from "vitest";
import { type Root, type View, computed, each, render, signal } from "zerolith";

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() =>
{
    root?.dispose();
    host?.remove();
});

describe("templates guide: JSX", () =>
{
    it("jsx", () =>
    {
        host = document.createElement("div");
        document.body.append(host);
        // #region jsx
        function Counter({ start, label }: { start: number; label: string }): View
        {
            const count = signal(start, { name: "count" });
            return (
                <button on:click={() => count.set(count.get() + 1)}>
                    {label}: {count}
                </button>
            );
        }

        function App(): View
        {
            const items = signal(["one", "two"]);
            const pending = signal(false);
            return (
                <main class="app">
                    <h1>Hello {computed(() => items.get().length)} items</h1>
                    <input prop:value={signal("typed")} bool:disabled={pending} />
                    <ul>{each(items, (item) => item, (item) => <li>{item}</li>)}</ul>
                    <Counter start={2} label="Clicks" />
                </main>
            );
        }
        // #endregion jsx
        root = render(App(), host);
        expect(host.querySelector("h1")?.textContent).toBe("Hello 2 items");
        expect(host.querySelector("input")?.value).toBe("typed");
        expect(host.querySelectorAll("li")).toHaveLength(2);
        const button = host.querySelector("button") as HTMLButtonElement;
        expect(button.textContent).toBe("Clicks: 2");
        button.click();
        expect(button.textContent).toBe("Clicks: 3");
    });
});
