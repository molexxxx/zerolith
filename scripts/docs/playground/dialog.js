/*
 * Accessible dialog: a focus trap keeps the keyboard inside the dialog
 * while it is open and gives focus back when it closes, and the
 * announcer tells screen readers what happened, without moving focus.
 *
 * Try: open the dialog and press Tab a few times, then Escape. Open it
 * again and choose Delete.
 */
import { html, render, signal, when } from "zerolith";
import { createAnnouncer, focusTrap } from "@zerolith/a11y";

const open = signal(false);
const announcer = createAnnouncer();

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

function remove()
{
    close();
    announcer.announce("Note deleted");
    console.log("Deleted, and announced to screen readers");
}

function Dialog()
{
    return html`
        <div role="dialog" aria-modal="true" aria-labelledby="title"
            ref=${focusTrap()} @keydown=${escape}>
            <h2 id="title">Delete the note?</h2>
            <p>Tab stays inside until you choose; Escape cancels.</p>
            <button @click=${close}>Cancel</button>
            <button @click=${remove}>Delete</button>
        </div>`;
}

render(html`
    <button @click=${() => open.set(true)}>Delete note</button>
    ${when(open, Dialog)}`, "#app");
