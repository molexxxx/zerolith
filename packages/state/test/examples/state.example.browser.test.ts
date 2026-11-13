// Executed examples for the state guide.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computed, each, html, render, signal } from "zerolith";
import { settle } from "@zerolith/test";
import { debounced, history, reconcile, selector, store, stored, throttled } from "@zerolith/state";

let host: HTMLElement;

beforeEach(() =>
{
    host = document.createElement("main");
    host.id = "app";
    document.body.append(host);
    localStorage.clear();
});

afterEach(() =>
{
    host.remove();
});

/** Types `value` into `field` as a reader would, with the input event the field fires. */
function typeInto(field: HTMLTextAreaElement | HTMLInputElement, value: string): void
{
    field.value = value;
    field.dispatchEvent(new Event("input"));
}

describe("state guide", () =>
{
    it("stored", async () =>
    {
        // #region stored
        const theme = stored<"light" | "dark">("theme", "light");
        const other = computed(() => (theme.get() === "light" ? "dark" : "light"));

        render(html`
            <button @click=${() => theme.set(other.get())}>Switch to ${other}</button>
            <p>The theme is ${theme}, in every tab, after every reload.</p>`, "#app");
        // #endregion stored
        const button = host.querySelector("button") as HTMLButtonElement;
        expect(host.querySelector("p")?.textContent).toContain("light");
        button.click();
        await settle();
        expect(host.querySelector("p")?.textContent).toContain("dark");
        expect(localStorage.getItem("theme")).toBe("\"dark\"");
    });

    it("history", async () =>
    {
        // #region history
        const text = signal("");
        const edits = history(text);
        const noUndo = computed(() => !edits.canUndo.get());
        const noRedo = computed(() => !edits.canRedo.get());

        function type(event: Event): void
        {
            edits.checkpoint();
            text.set((event.currentTarget as HTMLTextAreaElement).value);
        }

        render(html`
            <textarea .value=${text} @input=${type}></textarea>
            <button ?disabled=${noUndo} @click=${edits.undo}>Undo</button>
            <button ?disabled=${noRedo} @click=${edits.redo}>Redo</button>`, "#app");
        // #endregion history
        const area = host.querySelector("textarea") as HTMLTextAreaElement;
        const [undo, redo] = host.querySelectorAll("button");
        expect(undo?.disabled).toBe(true);
        typeInto(area, "hello");
        typeInto(area, "hello world");
        await settle();
        expect(undo?.disabled).toBe(false);
        undo?.click();
        await settle();
        expect(text.get()).toBe("hello");
        expect(area.value).toBe("hello");
        expect(redo?.disabled).toBe(false);
        redo?.click();
        await settle();
        expect(text.get()).toBe("hello world");
    });

    it("draft", async () =>
    {
        // #region draft
        const draft = stored("draft", "");
        const edits = history(draft);
        const noUndo = computed(() => !edits.canUndo.get());

        function type(event: Event): void
        {
            edits.checkpoint();
            draft.set((event.currentTarget as HTMLTextAreaElement).value);
        }

        render(html`
            <textarea .value=${draft} @input=${type}></textarea>
            <button ?disabled=${noUndo} @click=${edits.undo}>Undo</button>`, "#app");
        // #endregion draft
        const area = host.querySelector("textarea") as HTMLTextAreaElement;
        const undo = host.querySelector("button") as HTMLButtonElement;
        expect(undo.disabled).toBe(true);
        typeInto(area, "hello");
        await settle();
        expect(localStorage.getItem("draft")).toBe("\"hello\"");
        typeInto(area, "hello world");
        await settle();
        expect(localStorage.getItem("draft")).toBe("\"hello world\"");
        undo.click();
        await settle();
        expect(area.value).toBe("hello");
        expect(localStorage.getItem("draft")).toBe("\"hello\"");
        expect(undo.disabled).toBe(false);
    });

    it("timing", async () =>
    {
        // #region timing
        const query = signal("");
        const settledQuery = debounced(query, 300);
        const scrollTop = signal(0);
        const steadyScroll = throttled(scrollTop, 100);

        function search(event: Event): void
        {
            query.set((event.currentTarget as HTMLInputElement).value);
        }

        render(html`
            <input @input=${search}>
            <p>Searching for ${settledQuery}</p>
            <p>Scrolled to ${steadyScroll}</p>`, "#app");
        // #endregion timing
        const field = host.querySelector("input") as HTMLInputElement;
        typeInto(field, "zer");
        typeInto(field, "zero");
        await settle();
        expect(host.textContent).toContain("Searching for ");
        expect(host.textContent).not.toContain("zero");
        await new Promise((resolve) => setTimeout(resolve, 320));
        expect(host.textContent).toContain("Searching for zero");
        scrollTop.set(10);
        await settle();
        expect(host.textContent).toContain("Scrolled to 10");
    });

    it("selector", async () =>
    {
        // #region selector
        const rows = [
            { id: 1, label: "one" },
            { id: 2, label: "two" },
            { id: 3, label: "three" }
        ];
        const selectedId = signal<number | null>(null);
        const selected = selector(selectedId);

        render(html`
            <ul>${rows.map((row) => html`
                <li class=${computed(() => (selected(row.id).get() ? "selected" : ""))}
                    @click=${() => selectedId.set(row.id)}>${row.label}</li>`)}
            </ul>`, "#app");
        // #endregion selector
        const items = host.querySelectorAll("li");
        items[1]?.click();
        await settle();
        expect([...items].map((item) => item.className)).toEqual(["", "selected", ""]);
        items[2]?.click();
        await settle();
        expect([...items].map((item) => item.className)).toEqual(["", "", "selected"]);
    });

    it("store", async () =>
    {
        // #region store
        interface Task
        {
            id: number;
            title: string;
            done: boolean;
        }

        const [board, setBoard] = store({
            name: "Launch",
            tasks: [
                { id: 1, title: "Write the notes", done: false },
                { id: 2, title: "Tag the release", done: false }
            ] as Task[]
        });

        render(html`
            <h2>${computed(() => board.name)}</h2>
            <ul>${each(computed(() => board.tasks), (task) => task.id, (task) => html`
                <li class=${computed(() => (task.get().done ? "done" : ""))}>
                    ${computed(() => task.get().title)}
                </li>`)}
            </ul>`, "#app");

        // One field changes, and only the bindings that read it update.
        setBoard("tasks", 1, "done", true);

        // A new array for a list of a different length or order.
        const next = { id: 3, title: "Announce it", done: false };
        setBoard("tasks", (tasks) => [...tasks, next]);

        // The server's copy merged in by id: only the fields that differ change.
        setBoard("tasks", reconcile(await fetchTasks(), "id"));
        // #endregion store
        const items = host.querySelectorAll("li");
        expect([...items].map((item) => item.className)).toEqual(["", "done", ""]);
        expect([...items].map((item) => item.textContent?.trim())).toEqual(["Write the notes", "Tag the release", "Announce it!"]);
        expect(host.querySelector("h2")?.textContent).toBe("Launch");
    });
});

/** The tasks as the server holds them, with the third one's title changed. */
function fetchTasks(): Promise<{ id: number; title: string; done: boolean }[]>
{
    return Promise.resolve([
        { id: 1, title: "Write the notes", done: false },
        { id: 2, title: "Tag the release", done: true },
        { id: 3, title: "Announce it!", done: false }
    ]);
}
