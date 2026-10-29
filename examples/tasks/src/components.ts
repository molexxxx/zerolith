// Components: plain functions returning views, with scoped styles.
import { type View, computed, css, each, html, signal, when } from "zerolith";
import { focusTrap } from "@zerolith/a11y";
import { createForm } from "@zerolith/forms";
import { router } from "./router.ts";
import { format, locale, t } from "./locale.ts";
import { taskSchema } from "./schema.ts";
import { type Task, api, done, open, query, remove, tasks, toggle } from "./store.ts";

const layout = css`
    :scope { max-width: 44rem; margin: 0 auto; padding: 24px 16px; display: grid; gap: 24px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    header h1 { margin: 0; font-size: 1.5rem; }
    header h1 a { color: inherit; text-decoration: none; }
    header nav { display: flex; align-items: center; gap: 12px; }
`;

/** The page frame around every route. */
export function Layout({ content }: { content: unknown }): View
{
    return html`
        <main class=${layout}>
            <header>
                <h1><a href=${router.href("home")}>${t((m) => m.title())}</a></h1>
                <nav>
                    <a href=${router.href("create")} data-testid="new">${t((m) => m.newTask())}</a>
                    <label>${t((m) => m.language())}
                        <select data-testid="language" .value=${locale.locale} @change=${(event: Event) => locale.set((event.currentTarget as HTMLSelectElement).value)}>
                            <option value="en">English</option>
                            <option value="de">Deutsch</option>
                        </select>
                    </label>
                </nav>
            </header>
            ${content}
        </main>`;
}

const list = css`
    :scope { display: grid; gap: 16px; }
    h2 { font-size: 1rem; color: var(--muted); margin: 0; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    li { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    li a { flex: 1; text-decoration: none; }
    li[data-done="true"] a { color: var(--muted); text-decoration: line-through; }
    .empty { color: var(--muted); }
`;

function TaskRow(task: () => Task): View
{
    return html`
        <li data-done=${computed(() => String(task().done))}>
            <input type="checkbox" .checked=${computed(() => task().done)} aria-label=${computed(() => task().title)} @change=${() => void toggle(task())}>
            <a href=${computed(() => router.href("task", { id: task().id }))}>${computed(() => task().title)}</a>
        </li>`;
}

/** The searchable list, split into open and done tasks. */
export function TaskList(): View
{
    return html`
        <section class=${list}>
            <label>${t((m) => m.search())} <input type="search" .value=${query} @input=${(event: Event) => query.set((event.currentTarget as HTMLInputElement).value)} data-testid="search"></label>
            ${when(tasks.pending, () => html`<p class="empty">...</p>`)}
            <h2 data-testid="open-count">${computed(() => t((m, count: number) => m.openCount({ count }), open.get().length).get())}</h2>
            <ul data-testid="open">${each(open, (task) => task.id, (task) => TaskRow(() => task.get()))}</ul>
            ${when(computed(() => done.get().length > 0), () => html`
                <h2>${t((m) => m.done())}</h2>
                <ul data-testid="done">${each(done, (task) => task.id, (task) => TaskRow(() => task.get()))}</ul>`)}
        </section>`;
}

const detail = css`
    :scope { display: grid; gap: 12px; }
    .actions { display: flex; gap: 8px; }
    dialog { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
    dialog::backdrop { background: rgb(0 0 0 / 0.5); }
    dialog .actions { margin-top: 12px; justify-content: flex-end; }
`;

/** One task with a delete dialog. */
export function TaskView({ id }: { id: string }): View
{
    const task = api.query("getTask", () => ({ params: { id } }));
    const confirming = signal(false);
    const erase = async (): Promise<void> =>
    {
        await remove(id);
        confirming.set(false);
        await router.navigate(router.href("home"));
    };
    return html`
        <section class=${detail} data-testid="task">
            ${when(task.error, () => html`<p>${t((m) => m.notFound())}</p>`, () => html`
                <h2>${computed(() => task.get()?.title ?? "")}</h2>
                <p>${computed(() => (task.get() === undefined ? "" : t((m, at: Date) => m.createdAt({ when: at }), new Date(task.get()?.createdAt ?? 0)).get()))}</p>
                <p>${computed(() =>
                {
                    const created = task.get()?.createdAt;
                    return created === undefined ? "" : format.relative(Math.round((Date.parse(created) - Date.now()) / 86_400_000), "day", { numeric: "auto" });
                })}</p>
                <div class="actions">
                    <a href=${router.href("home")}>${t((m) => m.back())}</a>
                    <button data-kind="danger" data-testid="delete" @click=${() => confirming.set(true)}>${t((m) => m.remove())}</button>
                </div>
                ${when(confirming, () => html`
                    <div role="dialog" aria-modal="true" aria-labelledby="confirm" data-testid="dialog" ref=${focusTrap()} @keydown=${(event: KeyboardEvent) => event.key === "Escape" && confirming.set(false)}>
                        <p id="confirm">${computed(() => t((m, title: string) => m.confirm({ title }), task.get()?.title ?? "").get())}</p>
                        <div class="actions">
                            <button @click=${() => confirming.set(false)}>${t((m) => m.cancel())}</button>
                            <button data-kind="danger" data-testid="confirm" @click=${() => void erase()}>${t((m) => m.remove())}</button>
                        </div>
                    </div>`)}`)}
        </section>`;
}

const form = css`
    :scope { display: grid; gap: 12px; max-width: 28rem; }
    label { display: grid; gap: 4px; }
    output { color: var(--danger); font-size: 0.9rem; }
    .actions { display: flex; gap: 8px; }
`;

/** Creates a task through the API with the schema the API validates with. */
export function TaskForm(): View
{
    const draft = createForm({
        schema: taskSchema,
        onSuccess: () =>
        {
            tasks.reload();
            void router.navigate(router.href("home"));
        }
    });
    return html`
        <form class=${form} method="post" action="/api/tasks" @submit=${draft.submit} data-testid="form">
            <label>${t((m) => m.titleLabel())}
                <input name="title" autofocus aria-invalid=${draft.field("title").invalid} aria-describedby="title-error">
            </label>
            <output id="title-error" data-testid="title-error">${draft.field("title").error}</output>
            <div class="actions">
                <button data-kind="primary" ?disabled=${draft.pending}>${t((m) => m.save())}</button>
                <a href=${router.href("home")}>${t((m) => m.cancel())}</a>
            </div>
        </form>`;
}

/** The fallback for unknown URLs. */
export function NotFound(): View
{
    return html`<p>${t((m) => m.notFound())} <a href=${router.href("home")}>${t((m) => m.back())}</a></p>`;
}
