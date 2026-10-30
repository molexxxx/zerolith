// Components are plain functions returning views. Styles are scoped css
// literals bound to a root element's class. Return types are declared so
// the route table's type does not depend on the component bodies.
import { computed, css, each, effect, html, signal, when } from "zerolith";
import { router } from "./router.js";
import { create, filtered, find, notes, query, remove, seed, update } from "./store.js";

/** @typedef {import("zerolith").View} View */
/** @typedef {import("./store.js").Note} Note */

const layout = css`
    :scope { max-width: 48rem; margin: 0 auto; padding: 24px 16px; display: grid; gap: 24px; }
    header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
    header h1 { margin: 0; font-size: 1.5rem; }
    header h1 a { color: inherit; text-decoration: none; }
`;

/**
 * The page frame around every route.
 * @param {{ content: unknown }} props
 * @returns {View}
 */
export function Layout({ content })
{
    return html`
        <main class=${layout}>
            <header>
                <h1><a href=${router.href("home")}>Notes</a></h1>
                <a href=${router.href("create")} data-testid="new">New note</a>
            </header>
            ${content}
        </main>`;
}

const list = css`
    :scope { display: grid; gap: 12px; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    li { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    li a { flex: 1; text-decoration: none; }
    li small { color: var(--muted); }
    .empty { color: var(--muted); padding: 24px; text-align: center; }
`;

/**
 * The searchable list of notes.
 * @returns {View}
 */
export function NoteList()
{
    const empty = computed(() => filtered.get().length === 0);
    return html`
        <section class=${list}>
            <label>Search <input type="search" .value=${query} @input=${(/** @type {Event} */ event) => query.set(/** @type {HTMLInputElement} */ (event.currentTarget).value)} data-testid="search"></label>
            ${when(seed.pending, () => html`<p class="empty" data-testid="loading">Loading the seed notes</p>`)}
            ${when(seed.error, () => html`<p class="empty">The seed data did not load. <button @click=${() => seed.reload()}>Try again</button></p>`)}
            ${when(empty, () => html`<p class="empty" data-testid="empty">No notes match.</p>`, () => html`
                <ul data-testid="notes">
                    ${each(filtered, (note) => note.id, (note) => html`
                        <li>
                            <a href=${computed(() => router.href("note", { id: note.get().id }))}>${computed(() => note.get().title)}</a>
                            <small>${computed(() => new Date(note.get().updatedAt).toLocaleDateString())}</small>
                            <button data-kind="danger" @click=${() => remove(note.get().id)} aria-label=${computed(() => `Delete ${note.get().title}`)}>Delete</button>
                        </li>`)}
                </ul>`)}
        </section>`;
}

const article = css`
    :scope { display: grid; gap: 12px; }
    h2 { margin: 0; }
    p { white-space: pre-wrap; }
    .actions { display: flex; gap: 8px; }
`;

/**
 * One note.
 * @param {{ id: string }} props
 * @returns {View}
 */
export function NoteView({ id })
{
    const note = computed(() => find(id));
    return when(note, () => html`
        <article class=${article} data-testid="note">
            <h2>${computed(() => note.get()?.title ?? "")}</h2>
            <p>${computed(() => note.get()?.body ?? "")}</p>
            <div class="actions">
                <a href=${router.href("edit", { id })}>Edit</a>
                <a href=${router.href("home")}>Back</a>
            </div>
        </article>`, () => html`<p data-testid="missing">There is no note with id ${id}. <a href=${router.href("home")}>Back to the list</a></p>`);
}

const form = css`
    :scope { display: grid; gap: 12px; }
    label { display: grid; gap: 4px; }
    textarea { min-height: 8rem; }
    .actions { display: flex; gap: 8px; }
`;

/**
 * Creates or edits a note with a native form. Validation is the browser's; the title input receives focus on mount.
 * @param {{ id?: string }} props
 * @returns {View}
 */
export function NoteForm({ id })
{
    const existing = id === undefined ? undefined : find(id);
    /** @type {import("zerolith").Signal<HTMLInputElement | undefined>} */
    const title = signal(undefined);
    effect(() =>
    {
        title.get()?.focus();
    });

    /** @param {SubmitEvent} event */
    const submit = (event) =>
    {
        event.preventDefault();
        const element = /** @type {HTMLFormElement} */ (event.currentTarget);
        if (!element.reportValidity())
        {
            return;
        }
        const data = new FormData(element);
        const draft = { title: String(data.get("title") ?? ""), body: String(data.get("body") ?? "") };
        let target;
        if (existing === undefined)
        {
            target = create(draft).id;
        }
        else
        {
            update(existing.id, draft);
            target = existing.id;
        }
        void router.navigate(router.href("note", { id: target }));
    };

    return html`
        <form class=${form} @submit=${submit} data-testid="form">
            <label>Title <input ref=${title} name="title" required minlength="2" .value=${existing?.title ?? ""}></label>
            <label>Body <textarea name="body" .value=${existing?.body ?? ""}></textarea></label>
            <div class="actions">
                <button data-kind="primary">${existing === undefined ? "Create" : "Save"}</button>
                <a href=${existing === undefined ? router.href("home") : router.href("note", { id: existing.id })}>Cancel</a>
            </div>
        </form>`;
}

/**
 * Shown for unknown URLs.
 * @returns {View}
 */
export function NotFound()
{
    return html`<p data-testid="not-found">That page does not exist. There are ${computed(() => notes.get().length)} notes on the <a href="/">list</a>.</p>`;
}
