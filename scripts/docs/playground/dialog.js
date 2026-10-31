import { html, render, signal, when } from "zerolith";
import { createAnnouncer, focusTrap } from "@zerolith/a11y";

const open = signal(false);
const announcer = createAnnouncer();

function confirmDelete()
{
    open.set(false);
    announcer.announce("Note deleted");
    console.log("Deleted, and announced to screen readers");
}

render(html`
    <button @click=${() => open.set(true)}>Delete note</button>
    ${when(open, () => html`
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" ref=${focusTrap()}>
            <h2 id="confirm-title">Delete the note?</h2>
            <p>Focus stays inside until you choose. Escape does nothing here on purpose.</p>
            <button @click=${() => open.set(false)}>Cancel</button>
            <button @click=${confirmDelete}>Delete</button>
        </div>`)}`, "#app");
