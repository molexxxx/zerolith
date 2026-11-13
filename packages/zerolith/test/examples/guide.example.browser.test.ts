// Executed examples for the introduction and the templates and styles guides.
// Each region is application code the documentation shows with its imports;
// the checks around it run in a real browser, so the docs cannot drift.
/// <reference types="zerolith/imports" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ReadableSignal, type Signal, batch, boundary, computed, context, css, each, html, render, signal, when } from "zerolith";
import summary from "./summary.css?scoped";

let host: HTMLElement;

beforeEach(() =>
{
    host = document.createElement("main");
    host.id = "app";
    document.body.append(host);
});

afterEach(() =>
{
    host.remove();
});

describe("templates guide", () =>
{
    it("counter", () =>
    {
        // #region counter
        function Counter({ start = 0 }: { start?: number })
        {
            const count = signal(start);
            const doubled = computed(() => count.get() * 2);
            return html`
                <section>
                    <p>Count: ${count}, doubled: ${doubled}</p>
                    <button @click=${() => count.set(count.get() + 1)}>Add one</button>
                </section>`;
        }

        render(Counter({ start: 1 }), "#app");
        // #endregion counter
        host.querySelector("button")?.click();
        expect(host.querySelector("p")?.textContent).toBe("Count: 2, doubled: 4");
    });

    it("frozen", () =>
    {
        // #region frozen
        const count = signal(1);

        render(html`
            <p class="live">${count}</p>
            <p class="frozen">${count.get()}</p>`, "#app");

        // The first paragraph now shows 2; the second still shows 1.
        count.set(2);
        // #endregion frozen
        expect(host.querySelector(".live")?.textContent).toBe("2");
        expect(host.querySelector(".frozen")?.textContent).toBe("1");
    });

    it("error boundary", () =>
    {
        // #region error-boundary
        const prices = signal<number[] | undefined>([12, 30, 8]);

        function Highest()
        {
            const highest = computed(() =>
            {
                const list = prices.get();
                if (list === undefined)
                {
                    throw new Error("The prices did not load.");
                }
                return Math.max(...list);
            });
            return html`<p>Highest price: ${highest}</p>`;
        }

        function showProblem(error: unknown, retry: () => void)
        {
            const text = error instanceof Error ? error.message : "Something failed.";
            return html`
                <p role="alert">${text}</p>
                <button type="button" @click=${retry}>Try again</button>`;
        }

        render(html`
            <h1>Prices</h1>
            ${boundary(() => Highest(), showProblem)}`, "#app");
        // #endregion error-boundary
        expect(host.querySelector("p")?.textContent).toBe("Highest price: 30");
        prices.set(undefined);
        expect(host.querySelector("[role=alert]")?.textContent).toBe("The prices did not load.");
        expect(host.querySelector("h1")?.textContent).toBe("Prices");
        prices.set([5]);
        host.querySelector("button")?.click();
        expect(host.querySelector("p")?.textContent).toBe("Highest price: 5");
    });

    it("context", () =>
    {
        // #region context
        const Theme = context<"light" | "dark">("light");

        function SaveButton()
        {
            return html`<button class=${Theme.read()}>Save</button>`;
        }

        function Toolbar()
        {
            return html`<nav>${SaveButton()}</nav>`;
        }

        render(() => Theme.provide("dark", () => Toolbar()), "#app");
        // #endregion context
        expect(host.querySelector("button")?.className).toBe("dark");
        expect(Theme.read()).toBe("light");
    });

    it("components", () =>
    {
        let panels = 0;
        // #region components
        function Badge({ count }: { count: ReadableSignal<number> })
        {
            return html`<span class="badge">${count}</span>`;
        }

        function Panel({ title, children }: { title: string; children: unknown })
        {
            // #endregion components
            panels++;
            // #region components
            return html`
                <section>
                    <h2>${title}</h2>
                    ${children}
                </section>`;
        }

        const unread = signal(3);
        const inbox = Panel({
            title: "Inbox",
            children: html`<p>Unread: ${Badge({ count: unread })}</p>`
        });

        render(inbox, "#app");

        // The badge now shows 4, and neither Panel nor Badge runs again.
        unread.set(4);
        // #endregion components
        expect(host.querySelector("h2")?.textContent).toBe("Inbox");
        expect(host.querySelector(".badge")?.textContent).toBe("4");
        expect(panels).toBe(1);
    });

    it("mount", () =>
    {
        // #region mount
        const app = render(html`<p>Hello from zerolith</p>`, "#app");
        // #endregion mount
        expect(app.container).toBe(host);
        expect(host.querySelector("p")?.textContent).toBe("Hello from zerolith");
        // #region mount

        // Later, to take the view down and stop its effects:
        app.dispose();
        // #endregion mount
        expect(host.querySelector("p")).toBeNull();
    });

    it("bindings", () =>
    {
        // #region bindings
        const name = signal("");
        const tone = signal("quiet");
        const saving = signal(false);
        const field = signal<HTMLInputElement | undefined>(undefined);
        const typed = (event: Event) =>
            name.set((event.target as HTMLInputElement).value);

        render(html`
            <label>Name
                <input ref=${field} placeholder=${"Ada"} ?disabled=${saving}
                    .value=${name} @input=${typed}>
            </label>
            <p class="greeting ${tone}">Hello ${name}</p>`, "#app");

        field.get()?.focus();                   // the ref handed over the element
        name.set("<b>Ada</b>");                 // shown as text in both places
        saving.set(true);                       // adds the disabled attribute
        // #endregion bindings
        const input = host.querySelector("input") as HTMLInputElement;
        const paragraph = host.querySelector("p") as HTMLParagraphElement;
        expect(input.placeholder).toBe("Ada");
        expect(input.value).toBe("<b>Ada</b>");
        expect(input.disabled).toBe(true);
        expect(paragraph.className).toBe("greeting quiet");
        expect(paragraph.textContent).toBe("Hello <b>Ada</b>");
        expect(paragraph.querySelector("b")).toBeNull();
        input.value = "Grace";
        input.dispatchEvent(new InputEvent("input"));
        expect(paragraph.textContent).toBe("Hello Grace");
    });

    it("lists", () =>
    {
        // #region lists
        interface Task
        {
            id: number;
            text: string;
        }
        const tasks = signal<Task[]>([
            { id: 1, text: "write" },
            { id: 2, text: "test" }
        ]);

        render(html`
            <ul>
                ${each(tasks, (task) => task.id, (task) => html`
                    <li>${computed(() => task.get().text)}</li>`)}
            </ul>`, "#app");
        // #endregion lists
        const write = host.querySelector("li");
        // #region lists

        // The row with id 1 moves to the end, keeps its element, and updates its text:
        tasks.set([{ id: 2, text: "test" }, { id: 1, text: "write, edited" }]);
        // #endregion lists
        expect(host.querySelectorAll("li")[1]).toBe(write);
        expect(write?.textContent).toBe("write, edited");
    });

    it("lists edited a row at a time", () =>
    {
        // #region lists-edited
        interface Task
        {
            id: number;
            text: Signal<string>;
            done: Signal<boolean>;
        }
        const tasks = signal<Task[]>([
            { id: 1, text: signal("write"), done: signal(false) },
            { id: 2, text: signal("test"), done: signal(false) }
        ]);

        render(html`
            <ul>
                ${each(tasks, (task) => task.id, (task) =>
                {
                    const { text, done } = task.get();
                    const state = computed(() => (done.get() ? "done" : ""));
                    return html`<li class=${state}>${text}</li>`;
                })}
            </ul>`, "#app");

        function finish(id: number, text: string): void
        {
            const task = tasks.get().find((candidate) => candidate.id === id);
            batch(() =>
            {
                task?.text.set(text);
                task?.done.set(true);
            });
        }
        // #endregion lists-edited
        const list = tasks.get();
        const write = host.querySelector("li");
        // #region lists-edited

        // Row 1 updates its text and class; the array stays as it is:
        finish(1, "write, edited");
        // #endregion lists-edited
        expect(tasks.get()).toBe(list);
        expect(host.querySelector("li")).toBe(write);
        expect([write?.textContent, write?.className]).toEqual(["write, edited", "done"]);
        expect(host.querySelectorAll("li")[1]?.className).toBe("");
    });

    it("conditions", () =>
    {
        // #region conditions
        const user = signal<string | null>(null);

        render(html`
            <header>
                ${when(user,
                    () => html`<p>Hello ${user}</p>`,
                    () => html`<a href="/sign-in">Sign in</a>`)}
            </header>`, "#app");
        // #endregion conditions
        expect(host.textContent?.trim()).toBe("Sign in");
        // #region conditions

        user.set("Ada");                        // swaps the link for the greeting
        // #endregion conditions
        expect(host.textContent?.trim()).toBe("Hello Ada");
    });

    it("styles", () =>
    {
        // #region styles
        const card = css`
            :scope { padding: 12px; }
            h2 { margin: 0; }
        `;

        function Card({ title }: { title: string })
        {
            return html`<article class=${card}><h2>${title}</h2></article>`;
        }

        render(Card({ title: "Scoped" }), "#app");
        // #endregion styles
        expect(getComputedStyle(host.querySelector("article") as Element).paddingTop).toBe("12px");
    });

    it("file", () =>
    {
        // #region file
        function Summary({ total }: { total: string })
        {
            return html`
                <section class=${summary}>
                    <h2>Order</h2>
                    <p class="total">${total} <small>with tax</small></p>
                </section>
            `;
        }

        render(Summary({ total: "$42.00" }), "#app");
        // #endregion file
        const section = host.querySelector("section") as Element;
        expect(String(summary)).toMatch(/^zl-s zl-summary-[0-9a-z]+$/);
        expect(getComputedStyle(section).paddingTop).toBe("16px");
        expect(getComputedStyle(section.querySelector(".total") as Element).fontWeight).toBe("700");
        expect(getComputedStyle(section.querySelector("small") as Element).fontWeight).toBe("400");
    });

    it("boundary", () =>
    {
        // #region boundary
        const note = css`
            p { margin: 0; }
        `;
        const panel = css`
            :scope { display: grid; gap: 8px; }
            aside { border: 2px solid gray; }
            p { font-weight: 700; }
        `;

        function Note({ text }: { text: string })
        {
            return html`<aside class=${note}><p>${text}</p></aside>`;
        }

        function Panel()
        {
            return html`
                <section class=${panel}>
                    <p>The panel's own paragraph is bold.</p>
                    ${Note({ text: "The note's paragraph is not." })}
                </section>`;
        }

        render(Panel(), "#app");
        // #endregion boundary
        const [own, inner] = Array.from(host.querySelectorAll("p"));
        expect(getComputedStyle(own as Element).fontWeight).toBe("700");
        expect(getComputedStyle(inner as Element).fontWeight).toBe("400");
        expect(getComputedStyle(host.querySelector("aside") as Element).borderTopWidth).toBe("2px");
    });

    it("compose", () =>
    {
        // #region compose
        const control = css`
            :scope { padding: 8px 12px; border: 2px solid currentColor; }
        `;
        const primary = css`
            ${control}
            :scope { font-weight: 700; }
        `;

        render(html`<button class=${primary}>Save</button>`, "#app");
        // #endregion compose
        const button = getComputedStyle(host.querySelector("button") as Element);
        expect(button.paddingTop).toBe("8px");
        expect(button.fontWeight).toBe("700");
    });

    it("dynamic", () =>
    {
        // #region dynamic
        const meter = css`
            :scope { height: 8px; background: gray; }
            div { width: var(--level); height: 100%; background: green; }
        `;
        const level = signal(30);

        render(html`
            <div class=${meter}>
                <div style=${computed(() => `--level: ${level.get()}%`)}></div>
            </div>`, "#app");

        level.set(60);                          // the bar fills 60 percent
        // #endregion dynamic
        const outer = host.querySelector("div") as HTMLElement;
        const bar = outer.querySelector("div") as HTMLElement;
        expect(bar.getBoundingClientRect().width / outer.getBoundingClientRect().width).toBeCloseTo(0.6, 2);
    });
});
