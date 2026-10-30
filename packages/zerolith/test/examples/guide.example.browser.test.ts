// Executed examples for the introduction and the templates and styles guides.
// Each region is application code the documentation shows with its imports;
// the checks around it run in a real browser, so the docs cannot drift.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computed, css, each, html, render, signal, when } from "zerolith";

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
        const typed = (event: Event) => name.set((event.target as HTMLInputElement).value);

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
        const tasks = signal<Task[]>([{ id: 1, text: "write" }, { id: 2, text: "test" }]);

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
});
