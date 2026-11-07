// The packing list page: progress, undo and redo, the filters, the rows, a
// note when the filter leaves nothing to show, and one while offline. Its
// styles are in packing.css.
import { type View, computed, each, html, when } from "zerolith";
import { online } from "@zerolith/browser";
import { items, packedCount, shown } from "../store.ts";
import { AddItem } from "./add-item.ts";
import { Filters } from "./filters.ts";
import { ItemRow } from "./item.ts";
import page from "./packing.css?scoped";
import { UndoRedo } from "./undo-redo.ts";

export function Packing(): View
{
    const total = computed(() => items.get().length);
    const empty = computed(() => shown.get().length === 0);
    const isOnline = online();
    const status = computed(() =>
        (isOnline.get() ? "" : "Offline: changes are saved on this device."));
    return html`
        <section class=${page}>
            <h1>Packing list</h1>
            <p>${packedCount} of ${total} packed</p>
            ${UndoRedo()}
            ${Filters()}
            <ul>${each(shown, (item) => item.id, (item) => ItemRow({ item }))}
            </ul>
            ${when(empty, () => html`<p>Nothing to show here.</p>`)}
            ${AddItem()}
            <p role="status">${status}</p>
        </section>`;
}
