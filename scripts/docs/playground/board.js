/*
 * A store: nested data whose fields are signals, from @zerolith/state.
 * The board is one plain object. setBoard takes the path of keys to
 * change and the new value, so ticking a task writes one field and
 * updates one row. reconcile merges a fresh copy by id, and a task that
 * did not change is not touched at all.
 *
 * Try: tick a task and watch the console, which logs a row each time
 * one of its values changes. Rename the board. Press Sync, which
 * brings a copy from "the server" with one task done and one new:
 * only those two rows log.
 */
import { computed, css, each, effect, html, render } from "zerolith";
import { reconcile, snapshot, store } from "@zerolith/state";

const [board, setBoard] = store({
    name: "Launch",
    tasks: [
        { id: 1, title: "Write the notes", done: true },
        { id: 2, title: "Tag the release", done: false },
        { id: 3, title: "Publish the packages", done: false }
    ]
});

const name = computed(() => board.name);
const tasks = computed(() => board.tasks);
const left = computed(() =>
    board.tasks.filter((task) => !task.done).length);

const panel = css`
    :scope {
        display: grid;
        gap: 16px;
        max-width: 460px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    .name { min-width: 0; font-size: 24px; font-weight: 600; }
    .count { margin: 0; color: var(--muted); font-family: var(--font-mono); }
    ul { margin: 0; border-top: 2px solid var(--line); }
    li { padding: 12px 0; border-bottom: 2px solid var(--line); }
    li label { display: flex; }
    li:has(:checked) { color: var(--muted); text-decoration: line-through; }
    form, .bar { display: flex; gap: 8px; }
    input[name="title"] { flex: 1; min-width: 0; }
`;

const rename = (event) => setBoard("name", event.currentTarget.value);

/** Writes one field of one task: the path is the list, the item, the field. */
function toggle(id)
{
    const index = board.tasks.findIndex((task) => task.id === id);
    setBoard("tasks", index, "done", (done) => !done);
}

function add(event)
{
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("title");
    const title = field.value.trim();
    if (title !== "")
    {
        const id = Math.max(0, ...board.tasks.map((task) => task.id)) + 1;
        setBoard("tasks", (list) => [...list, { id, title, done: false }]);
        field.value = "";
    }
}

/** What a server would send: task 2 done, and a task 4 if there is none. */
function fetched()
{
    const copy = snapshot(board).tasks.map((task) =>
        (task.id === 2 ? { ...task, done: true } : task));
    return copy.some((task) => task.id === 4)
        ? copy
        : [...copy, { id: 4, title: "Announce it", done: false }];
}

const sync = () => setBoard("tasks", reconcile(fetched(), "id"));

function Task(task)
{
    const { id } = task.get();
    const title = computed(() => task.get().title);
    const done = computed(() => task.get().done);
    effect(() =>
    {
        const state = done.get() ? "done" : "open";
        console.log(`Task ${id}: ${title.get()}, ${state}`);
    });
    return html`
        <li>
            <label>
                <input type="checkbox" .checked=${done}
                    @change=${() => toggle(id)}>
                ${title}
            </label>
        </li>`;
}

render(html`
    <section class=${panel}>
        <input class="name" aria-label="Board name" .value=${name}
            @input=${rename}>
        <p class="count">${left} left on ${name}</p>
        <ul>${each(tasks, (task) => task.id, Task)}</ul>
        <form @submit=${add}>
            <input name="title" aria-label="Task" placeholder="Add a task"
                autocomplete="off">
            <button>Add</button>
        </form>
        <div class="bar">
            <button class="primary" @click=${sync}>Sync</button>
        </div>
    </section>`, "#app");
