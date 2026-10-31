// The packing list page: a row for every item, kept in step with the list.
import { type View, computed, each, html } from "zerolith";
import { items } from "../store.ts";

export function Packing(): View
{
    const count = computed(() => items.get().length);
    return html`
        <h1>Packing list</h1>
        <p>${count} items</p>
        <ul>
            ${each(items, (item) => item.id, (item) => html`
                <li>${computed(() => item.get().name)}</li>`)}
        </ul>`;
}
