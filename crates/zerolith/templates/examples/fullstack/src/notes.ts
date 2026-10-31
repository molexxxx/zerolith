// The notes page: the list comes from the backend's API, and the form adds
// a note through it. Both call /api on the page's own origin; zerolith dev
// forwards that to the backend while developing, and in production the
// backend serves the page itself.
import { type View, computed, css, each, html, resource, signal } from "zerolith";

/** A note, as the API returns it. */
export interface Note
{
    id: number;
    text: string;
}

const styles = css`
    form { display: flex; gap: 8px; margin: 16px 0; }
    input { flex: 1; }
    li { padding: 4px 0; }
`;

const revision = signal(0);

const notes = resource({
    params: () => revision.get(),
    loader: async ({ abort }) =>
    {
        const response = await fetch("/api/notes", { signal: abort });
        if (!response.ok)
        {
            throw new Error(`/api/notes answered ${response.status}`);
        }
        return (await response.json()) as Note[];
    }
});

const list = computed(() => notes.get() ?? []);

async function add(event: SubmitEvent): Promise<void>
{
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const text = new FormData(form).get("text");
    const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text })
    });
    if (response.ok)
    {
        form.reset();
        revision.set(revision.get() + 1);
    }
}

/** The list of notes and the form that adds one. */
export function Notes(): View
{
    return html`
        <section class=${styles}>
            <h1>Notes</h1>
            <form @submit=${add}>
                <input name="text" aria-label="New note" placeholder="Write a note" required>
                <button>Add</button>
            </form>
            <ul>${each(list, (note) => note.id, (note) => html`<li>${computed(() => note.get().text)}</li>`)}</ul>
        </section>`;
}
