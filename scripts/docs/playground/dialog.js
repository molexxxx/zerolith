/*
 * Accessible dialog: a focus trap keeps the keyboard inside the dialog
 * while it is open and gives focus back when it closes, and the
 * announcer tells screen readers what happened, without moving focus.
 *
 * Try: open the dialog and press Tab a few times, then Escape. Open it
 * again and choose Delete, then restore the note.
 */
import { computed, css, html, render, signal, when } from "zerolith";
import { createAnnouncer, focusTrap } from "@zerolith/a11y";

const open = signal(false);
const deleted = signal(false);
const announcer = createAnnouncer();

const panel = css`
    :scope {
        display: grid;
        gap: 16px;
        justify-items: start;
        max-width: 400px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    h2 { font-size: 28px; }
    p { margin: 0; color: var(--muted); }
    .note[data-deleted="true"] { text-decoration: line-through; }
    .backdrop {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        padding: 16px;
        background: color-mix(in srgb, var(--bg) 80%, transparent);
    }
    [role="dialog"] {
        display: grid;
        gap: 16px;
        width: min(100%, 400px);
        padding: 32px;
        border: 2px solid var(--danger);
        background: var(--surface);
    }
    .actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 8px; }
    .danger {
        border-color: var(--danger);
        background: var(--danger);
        color: var(--bg);
    }
`;

function close()
{
    open.set(false);
}

function escape(event)
{
    if (event.key === "Escape")
    {
        close();
    }
}

/** Closes the dialog when a click lands on the backdrop, not inside. */
function outside(event)
{
    if (event.target === event.currentTarget)
    {
        close();
    }
}

function remove()
{
    deleted.set(true);
    close();
    announcer.announce("Note deleted");
    console.log("Deleted, and announced to screen readers");
}

/** Opens the dialog, or restores a deleted note without asking. */
function act()
{
    if (deleted.get())
    {
        deleted.set(false);
        announcer.announce("Note restored");
        return;
    }
    open.set(true);
}

function Dialog()
{
    return html`
        <div class="backdrop" @click=${outside}>
            <div role="dialog" aria-modal="true" aria-labelledby="title"
                ref=${focusTrap()} @keydown=${escape}>
                <h2 id="title">Delete the note?</h2>
                <p>Tab stays inside until you choose; Escape cancels.</p>
                <div class="actions">
                    <button @click=${close}>Cancel</button>
                    <button class="danger" @click=${remove}>Delete</button>
                </div>
            </div>
        </div>`;
}

const label = computed(() => (deleted.get() ? "Restore" : "Delete note"));

render(html`
    <section class=${panel}>
        <h2>Groceries</h2>
        <p class="note" data-deleted=${deleted}>
            Oat milk, lemons, and coffee beans.
        </p>
        <button @click=${act}>${label}</button>
        ${when(open, Dialog)}
    </section>`, "#app");
