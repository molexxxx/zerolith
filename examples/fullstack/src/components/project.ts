// A project's board: its tasks in three columns, a form that adds one, and a
// dialog that confirms a delete. The router loads the project before the page
// opens and imports this module only then, so its code is a chunk of its own.
import { focusTrap } from "@zerolith/a11y";
import { createForm } from "@zerolith/forms";
import { type ReadableSignal, type View, computed, css, each, html, signal, when } from "zerolith";
import { type ProjectDetail, type Task, type TaskStatus, statuses } from "../../shared/model.ts";
import { newTaskSchema } from "../../shared/schema.ts";
import { due, format } from "../locale.ts";
import { router } from "../router.ts";
import { api, refresh } from "../store.ts";
import { Empty, Field } from "./ui.ts";

const TITLES: Record<TaskStatus, string> = { todo: "To do", doing: "Doing", done: "Done" };

const MOVES: Record<TaskStatus, { to: TaskStatus; label: string }[]> = {
    todo: [{ to: "doing", label: "Start" }],
    doing: [{ to: "todo", label: "Back" }, { to: "done", label: "Finish" }],
    done: [{ to: "doing", label: "Reopen" }]
};

const page = css`
    :scope { display: grid; gap: clamp(2rem, 4vw, 3rem); }
    .top { display: grid; gap: 1rem; max-width: 48rem; }
    .top h1 { font-size: var(--display); }
    .top p { color: var(--muted); font-size: 1.125rem; }
    .counts { font-family: var(--font-mono); font-size: 0.8125rem; }
    .layout { display: grid; gap: 2rem; align-items: start; }
    @media (min-width: 64rem) { .layout { grid-template-columns: minmax(0, 1fr) 20rem; } }
    .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: 1rem; }
    .column { display: grid; align-content: start; gap: 0.75rem; }
    .column h2 { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 0.5rem; border-bottom: 2px solid var(--text); font-size: 1.125rem; }
    .column h2 .count { font-size: 2rem; }
    .column ul { display: grid; gap: 0.75rem; margin: 0; padding: 0; list-style: none; }
    .task { display: grid; gap: 0.75rem; padding: 1rem; border: 2px solid var(--line); background: var(--surface); }
    .task h3 { font-family: var(--font-text); font-size: 1rem; font-weight: 700; letter-spacing: 0; line-height: 1.4; }
    .due { color: var(--muted); font-family: var(--font-mono); font-size: 0.75rem; }
    .due[data-late="true"] { color: var(--danger); }
    .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .actions button { min-height: 2.25rem; padding: 0 0.75rem; font-size: 0.875rem; }
    form { display: grid; gap: 1rem; padding: 1.5rem; border: 2px solid var(--text); }
    form h2 { font-size: 1.5rem; }
    .backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 1rem; background: color-mix(in srgb, var(--bg) 75%, transparent); }
    .dialog { display: grid; gap: 1rem; width: min(100%, 28rem); padding: 2rem; border: 2px solid var(--danger); background: var(--surface); }
    .dialog h2 { font-size: 1.5rem; }
`;

/** What the router hands the page: the project the loader found, if any. */
interface Props
{
    data: ProjectDetail | undefined;
}

export function ProjectPage({ data }: Props): View
{
    if (data === undefined)
    {
        return html`
            <section class=${page}>
                <div class="top">
                    <p class="eyebrow">Projects</p>
                    <h1>No such project.</h1>
                    <p><a href=${router.href("projects")}>See every project</a></p>
                </div>
            </section>`;
    }
    const { id } = data.project;
    const detail = signal(data);
    const confirming = signal<Task | undefined>(undefined);

    const reload = async (): Promise<void> =>
    {
        detail.set(await api.call("getProject", { params: { id } }));
        refresh();
    };
    const move = async (task: Task, status: TaskStatus): Promise<void> =>
    {
        await api.call("updateTask", { params: { id: task.id }, body: { status } });
        await reload();
    };
    const cancel = (): void => confirming.set(undefined);
    const escape = (event: KeyboardEvent): void =>
    {
        if (event.key === "Escape")
        {
            cancel();
        }
    };
    const remove = async (): Promise<void> =>
    {
        const task = confirming.get();
        cancel();
        if (task !== undefined)
        {
            await api.call("deleteTask", { params: { id: task.id } });
            await reload();
        }
    };
    const form = createForm({ schema: newTaskSchema, reset: true, onSuccess: () => void reload() });

    const card = (task: ReadableSignal<Task>): View =>
    {
        const moves = MOVES[task.get().status];
        const deadline = computed(() =>
        {
            const date = task.get().due;
            return date === null ? undefined : due(date);
        });
        return html`
            <li class="task">
                <h3>${computed(() => task.get().title)}</h3>
                ${when(deadline, () => html`
                    <p class="due" data-late=${computed(() => String(deadline.get()?.late === true && task.get().status !== "done"))}>Due ${computed(() => deadline.get()?.label ?? "")}</p>`)}
                <div class="actions">
                    ${moves.map(({ to, label }) => html`<button @click=${() => void move(task.get(), to)}>${label}</button>`)}
                    <button class="danger" aria-label=${computed(() => `Delete ${task.get().title}`)} @click=${() => confirming.set(task.get())}>Delete</button>
                </div>
            </li>`;
    };

    const column = (status: TaskStatus): View =>
    {
        const tasks = computed(() => detail.get().tasks.filter((task) => task.status === status));
        return html`
            <section class="column">
                <h2><span>${TITLES[status]}</span> <span class="count">${computed(() => format.number(tasks.get().length))}</span></h2>
                ${when(computed(() => tasks.get().length > 0),
                    () => html`<ul>${each(tasks, (task) => task.id, card)}</ul>`,
                    () => Empty({ text: "Nothing here." }))}
            </section>`;
    };

    const project = computed(() => detail.get().project);
    return html`
        <section class=${page}>
            <div class="top">
                <p class="eyebrow"><a href=${router.href("projects")}>Projects</a></p>
                <h1>${computed(() => project.get().name)}</h1>
                <p>${computed(() => project.get().summary)}</p>
                <span class="counts">${computed(() => `${format.number(project.get().open)} open, ${format.number(project.get().done)} done`)}</span>
            </div>
            <div class="layout">
                <div class="board">${statuses.map(column)}</div>
                <form method="post" action=${`/api/projects/${id}/tasks`} @submit=${form.submit}>
                    <h2>Add a task</h2>
                    ${Field({ form, name: "title", label: "Title", required: true })}
                    ${Field({ form, name: "due", label: "Due", type: "date" })}
                    <button class="primary" ?disabled=${form.pending}>Add task</button>
                </form>
            </div>
            ${when(confirming, () => html`
                <div class="backdrop">
                    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
                        aria-describedby="confirm-text" ref=${focusTrap()} @keydown=${escape}>
                        <h2 id="confirm-title">Delete this task?</h2>
                        <p id="confirm-text"><strong>${computed(() => confirming.get()?.title ?? "")}</strong> goes for good, for everyone on the project.</p>
                        <div class="actions">
                            <button @click=${cancel}>Keep it</button>
                            <button class="danger" @click=${() => void remove()}>Delete</button>
                        </div>
                    </div>
                </div>`)}
        </section>`;
}
