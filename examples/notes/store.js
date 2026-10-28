// Application state: one writable signal of notes, derived views over it,
// and the operations that change it. Persistence is a side effect in an
// effect, so nothing else needs to know about localStorage.
import { batch, computed, effect, resource, signal } from "zerolith";

/** @typedef {{ id: string, title: string, body: string, updatedAt: string }} Note */

const STORAGE_KEY = "zerolith-notes";

/** @type {import("zerolith").Signal<readonly Note[]>} */
export const notes = signal(/** @type {readonly Note[]} */ ([]));

/** @type {import("zerolith").Signal<string>} */
export const query = signal("");

/** Notes matching the search text, newest first. */
export const filtered = computed(() =>
{
    const text = query.get().trim().toLowerCase();
    return notes.get()
        .filter((note) => text === "" || note.title.toLowerCase().includes(text) || note.body.toLowerCase().includes(text))
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
});

/** @returns {readonly Note[] | undefined} */
function restore()
{
    try
    {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null)
        {
            return undefined;
        }
        return /** @type {Note[]} */ (JSON.parse(raw));
    }
    catch
    {
        return undefined;
    }
}

/** The seed data, loaded once; skipped when localStorage already holds notes. */
export const seed = resource({
    params: () => (restore() === undefined ? true : undefined),
    loader: async ({ abort }) =>
    {
        const response = await fetch("/examples/notes/data/notes.json", { signal: abort });
        if (!response.ok)
        {
            throw new Error(`HTTP ${response.status}`);
        }
        return /** @type {Promise<Note[]>} */ (response.json());
    }
});

const saved = restore();
if (saved !== undefined)
{
    notes.set(saved);
}

effect(() =>
{
    const loaded = seed.get();
    if (loaded !== undefined)
    {
        notes.set(loaded);
    }
});

effect(() =>
{
    const current = notes.get();
    try
    {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    }
    catch
    {
        // Storage can be unavailable; the app still works for the session.
    }
});

/**
 * @param {string} id
 * @returns {Note | undefined}
 */
export function find(id)
{
    return notes.get().find((note) => note.id === id);
}

/**
 * @param {{ title: string, body: string }} draft
 * @returns {Note}
 */
export function create(draft)
{
    /** @type {Note} */
    const note = { id: crypto.randomUUID(), title: draft.title, body: draft.body, updatedAt: new Date().toISOString() };
    notes.set([...notes.get(), note]);
    return note;
}

/**
 * @param {string} id
 * @param {{ title: string, body: string }} draft
 */
export function update(id, draft)
{
    const updatedAt = new Date().toISOString();
    notes.set(notes.get().map((note) => (note.id === id ? Object.assign({}, note, draft, { updatedAt }) : note)));
}

/** @param {string} id */
export function remove(id)
{
    batch(() =>
    {
        notes.set(notes.get().filter((note) => note.id !== id));
    });
}
