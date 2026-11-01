// A project's board: its tasks in three columns, a form that adds one, and a
// dialog that confirms a delete. The router loads the project before the page
// opens and imports this module only then, so its code is a chunk of its own.
// Its styles are in project.css, imported with ?scoped.
import { focusTrap } from "@zerolith/a11y";
import { createForm } from "@zerolith/forms";
import { type ReadableSignal, type View, computed, each, html, signal, when } from "zerolith";
import { type ProjectDetail, type Task, type TaskStatus, statuses } from "../../shared/model.ts";
import { newTaskSchema } from "../../shared/schema.ts";
import { due, format } from "../locale.ts";
import { router } from "../router.ts";
import { api, refresh } from "../store.ts";
import page from "./project.css?scoped";
import { Empty, Field } from "./ui.ts";

const TITLES: Record<TaskStatus, string> = { todo: "To do", doing: "Doing", done: "Done" };

const MOVES: Record<TaskStatus, { to: TaskStatus; label: string }[]> = {
    todo: [{ to: "doing", label: "Start" }],
    doing: [{ to: "todo", label: "Back" }, { to: "done", label: "Finish" }],
    done: [{ to: "doing", label: "Reopen" }]
};

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
