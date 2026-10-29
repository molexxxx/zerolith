import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { html, signal } from "zerolith";
import { type HotContext, accept, component, hydrate, render, save } from "@zerolith/vite/runtime";

let host: HTMLElement;
const Greeting = (name: string): string => `hello ${name}`;

beforeEach(() =>
{
    host = document.createElement("div");
    document.body.append(host);
});

afterEach(() =>
{
    host.remove();
});

describe("component registry", () =>
{
    it("returns the function itself without a hot context", () =>
    {
        expect(component(undefined, "Greeting", Greeting)).toBe(Greeting);
    });

    it("keeps one proxy per module and name and forwards to the latest version", () =>
    {
        const hot: HotContext = { data: {} };
        const first = component(hot, "Greeting", (name: string): string => `hello ${name}`);
        expect(first("x")).toBe("hello x");
        const second = component(hot, "Greeting", (name: string): string => `hi ${name}`);
        expect(second).toBe(first);
        expect(first("x")).toBe("hi x");
        expect(first.name).toBe("Greeting");
        expect(first.length).toBe(1);
        const other = component({ data: {} }, "Greeting", (name: string): string => name);
        expect(other).not.toBe(first);
    });
});

describe("roots", () =>
{
    it("renders through a factory and replaces a root mounted into the same container", () =>
    {
        render(() => html`<p>one</p>`, host);
        render(() => html`<p>two</p>`, host);
        expect(host.querySelectorAll("p")).toHaveLength(1);
        expect(host.textContent).toBe("two");
    });

    it("renders every root again on accept and hands saved values to named signals", async () =>
    {
        let renders = 0;
        function Counter(): unknown
        {
            renders += 1;
            const count = signal(0, { name: "hmr-count" });
            const other = signal(0);
            return html`<span data-count>${count}</span><span data-other>${other}</span><button @click=${() =>
            {
                count.set(count.get() + 1);
                other.set(9);
            }}>+</button>`;
        }
        render(() => Counter(), host);
        host.querySelector("button")?.click();
        await vi.waitFor(() =>
        {
            expect(host.querySelector("[data-count]")?.textContent).toBe("1");
            expect(host.querySelector("[data-other]")?.textContent).toBe("9");
        });

        save();
        accept();
        expect(renders).toBe(2);
        expect(host.querySelectorAll("button")).toHaveLength(1);
        expect(host.querySelector("[data-count]")?.textContent).toBe("1");
        expect(host.querySelector("[data-other]")?.textContent).toBe("0");

        accept();
        expect(renders).toBe(3);
        expect(host.querySelector("[data-count]")?.textContent).toBe("0");
    });

    it("forgets a disposed root", () =>
    {
        const root = render(() => html`<p>gone</p>`, host);
        root.dispose();
        expect(host.textContent).toBe("");
        accept();
        expect(host.textContent).toBe("");
    });

    it("hydrates through the same path", () =>
    {
        const result = hydrate(() => html`<p>hydrated</p>`, host);
        expect(Array.isArray(result.mismatches)).toBe(true);
        expect(host.textContent).toBe("hydrated");
        accept();
        expect(host.querySelectorAll("p")).toHaveLength(1);
        result.dispose();
        expect(host.textContent).toBe("");
    });
});

describe("an entry module that re-executes", () =>
{
    it("renders its root once and keeps the restored value through the accept that follows", () =>
    {
        let renders = 0;
        function Draft(): unknown
        {
            renders += 1;
            const text = signal("", { name: "hmr-draft" });
            return html`<output>${text}</output><button @click=${() => text.set("kept")}>set</button>`;
        }
        render(() => Draft(), host);
        host.querySelector("button")?.click();
        save();
        render(() => Draft(), host);
        expect(renders).toBe(2);
        expect(host.querySelector("output")?.textContent).toBe("kept");
        accept();
        expect(renders).toBe(2);
        expect(host.querySelectorAll("output")).toHaveLength(1);
        expect(host.querySelector("output")?.textContent).toBe("kept");
        accept();
        expect(renders).toBe(3);
    });
});
