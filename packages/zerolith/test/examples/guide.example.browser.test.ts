// Executed examples for the templates and styles guides. Each region is
// included in the documentation verbatim and runs in a real browser.
import { afterEach, describe, expect, it } from "vitest";
import { type Root, computed, css, each, html, render, signal, when } from "zerolith";

let root: Root | undefined;
let host: HTMLElement | undefined;

function mount(view: unknown): HTMLElement
{
    host = document.createElement("div");
    document.body.append(host);
    root = render(view, host);
    return host;
}

afterEach(() =>
{
    root?.dispose();
    host?.remove();
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

        const el = mount(Counter({ start: 1 }));
        el.querySelector("button")?.click();
        expect(el.querySelector("p")?.textContent).toBe("Count: 2, doubled: 4");
        // #endregion counter
    });

    it("mount", () =>
    {
        root = undefined;
        host = document.createElement("main");
        host.id = "app";
        document.body.append(host);

        // #region mount
        const app = render(html`<p>Hello from zerolith</p>`, "#app");
        expect(app.container).toBe(document.querySelector("#app"));
        expect(document.querySelector("#app p")?.textContent).toBe("Hello from zerolith");

        app.dispose();
        expect(document.querySelector("#app p")).toBeNull();
        // #endregion mount
    });

    it("bindings", () =>
    {
        // #region bindings
        const title = signal("first");
        const disabled = signal(false);
        const input = signal<HTMLInputElement | undefined>(undefined);
        const clicks: string[] = [];

        const el = mount(html`
            <input ref=${input} title=${title} ?disabled=${disabled} .value=${"typed"} @input=${() => clicks.push("input")}>
            <p class="note ${"extra"}">${"<b>stays text</b>"}</p>`);

        expect(input.get()?.title).toBe("first");
        expect(input.get()?.value).toBe("typed");
        expect(el.querySelector("p")?.textContent).toBe("<b>stays text</b>");

        title.set("second");
        disabled.set(true);
        expect(input.get()?.title).toBe("second");
        expect(input.get()?.disabled).toBe(true);
        // #endregion bindings
    });

    it("lists", () =>
    {
        // #region lists
        interface Task
        {
            id: number;
            text: string;
        }
        const tasks = signal<Task[]>([{ id: 1, text: "write" }, { id: 2, text: "test" }]);

        const el = mount(html`
            <ul>${each(tasks, (task) => task.id, (task) => html`<li>${computed(() => task.get().text)}</li>`)}</ul>`);

        const first = el.querySelector("li");
        tasks.set([{ id: 2, text: "test" }, { id: 1, text: "write, edited" }]);
        expect(el.querySelectorAll("li")[1]).toBe(first);           // the same node, moved and updated
        expect(first?.textContent).toBe("write, edited");
        // #endregion lists
    });

    it("conditions", () =>
    {
        // #region conditions
        const user = signal<string | null>(null);

        const el = mount(html`${when(user, () => html`<p>Hello ${user}</p>`, () => html`<p>Sign in</p>`)}`);

        expect(el.textContent).toBe("Sign in");
        user.set("ann");
        expect(el.textContent).toBe("Hello ann");
        // #endregion conditions
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

        const el = mount(Card({ title: "Scoped" }));
        expect(getComputedStyle(el.querySelector("article") as Element).paddingTop).toBe("12px");
        // #endregion styles
    });
});
