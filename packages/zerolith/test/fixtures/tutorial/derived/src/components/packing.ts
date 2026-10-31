// The packing list page: progress, the filters, the rows, and a note when
// the filter leaves nothing to show.
import { type View, computed, each, html, when } from "zerolith";
import { items, packedCount, shown } from "../store.ts";
import { AddItem } from "./add-item.ts";
import { Filters } from "./filters.ts";
import { ItemRow } from "./item.ts";

export function Packing(): View
{
    const total = computed(() => items.get().length);
    const empty = computed(() => shown.get().length === 0);
    return html`
        <h1>Packing list</h1>
        <p>${packedCount} of ${total} packed</p>
        ${Filters()}
        <ul>${each(shown, (item) => item.id, (item) => ItemRow({ item }))}</ul>
        ${when(empty, () => html`<p>Nothing to show here.</p>`)}
        ${AddItem()}`;
}
