/*
 * Saved state: notes that survive a reload. stored reads them back from
 * storage when the app starts and writes each change; history saves a
 * checkpoint before every change, for Undo and Redo; debounced holds
 * the search until you stop typing; and selector marks the open note,
 * so opening another touches two rows of the list and no others.
 *
 * Try: edit a note and add one, then press Undo and Redo, which step
 * through your last 50 changes, counting each keystroke as one. Press
 * Run, which starts the preview afresh: the notes are as you left them,
 * while the history starts empty. Type a search and watch the console,
 * which logs one search when you pause, not one per key. Reset clears
 * what was saved.
 */
import { computed, css, each, effect, html, render, signal } from "zerolith";
import { debounced, history, selector, stored } from "@zerolith/state";

const notes = stored("notes", [
    { id: 1, text: "Passport\nRenew it before March, with two photos." },
    { id: 2, text: "Camping\nAsk Sam about the spare tent." },
    { id: 3, text: "Porto\nBook the train for the 14th." }
]);
const edits = history(notes);
const open = signal(notes.get()[0]?.id);
const isOpen = selector(open);
const query = signal("");
const search = debounced(query, 300);

effect(() =>
{
    const words = search.get().trim();
    if (words !== "")
    {
        console.log(`Searching for "${words}"`);
    }
});

const shown = computed(() =>
{
    const words = search.get().trim().toLowerCase();
    return notes.get().filter((note) =>
        note.text.toLowerCase().includes(words));
});
const current = computed(() =>
    notes.get().find((note) => note.id === open.get()));
const text = computed(() => current.get()?.text ?? "");
const closed = computed(() => current.get() === undefined);
const noUndo = computed(() => !edits.canUndo.get());
const noRedo = computed(() => !edits.canRedo.get());

const panel = css`
    :scope {
        display: grid;
        gap: 16px;
        max-width: 640px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    h2 { font-size: 28px; }
    .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .bar h2 { flex: 1; }
    .delete { margin-inline-start: auto; }
    .notes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
    }
    ul { margin: 0; padding: 0; list-style: none; }
    li + li { margin-top: -2px; }
    li button {
        width: 100%;
        justify-content: start;
        border-color: var(--line);
        font-weight: 400;
    }
    li button:hover { background: var(--bg); color: var(--text); }
    li button[aria-current="true"] {
        border-color: var(--text);
        background: var(--text);
        color: var(--bg);
    }
    textarea { min-height: 160px; }
`;

/** Saves a checkpoint for Undo, then sets the notes to `next`. */
function change(next)
{
    edits.checkpoint();
    notes.set(next);
}

function add()
{
    const id = Math.max(0, ...notes.get().map((note) => note.id)) + 1;
    change([{ id, text: "" }, ...notes.get()]);
    open.set(id);
}

function remove()
{
    const rest = notes.get().filter((note) => note.id !== open.get());
    change(rest);
    open.set(rest[0]?.id);
}

function write(event)
{
    const value = event.currentTarget.value;
    change(notes.get().map((note) =>
        (note.id === open.get() ? { ...note, text: value } : note)));
}

const type = (event) => query.set(event.currentTarget.value);

/** A note in the list, by its first line; pressed, it opens the note. */
function Row(note)
{
    const { id } = note.get();
    const title = computed(() =>
        note.get().text.split("\n")[0].trim() || "New note");
    return html`
        <li>
            <button aria-current=${isOpen(id)} @click=${() => open.set(id)}>
                ${title}
            </button>
        </li>`;
}

render(html`
    <section class=${panel}>
        <div class="bar">
            <h2>Notes</h2>
            <button class="primary" @click=${add}>New</button>
        </div>
        <input type="search" aria-label="Search notes" placeholder="Search"
            .value=${query} @input=${type}>
        <div class="notes">
            <ul>${each(shown, (note) => note.id, Row)}</ul>
            <textarea aria-label="Note" placeholder="Write a note"
                .value=${text} ?disabled=${closed} @input=${write}></textarea>
        </div>
        <div class="bar">
            <button ?disabled=${noUndo} @click=${edits.undo}>Undo</button>
            <button ?disabled=${noRedo} @click=${edits.redo}>Redo</button>
            <button class="delete" ?disabled=${closed} @click=${remove}>
                Delete
            </button>
        </div>
    </section>`, "#app");
