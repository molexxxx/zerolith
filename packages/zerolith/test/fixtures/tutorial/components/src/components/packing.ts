// The packing list page, put together from its parts.
import { type View, computed, each, html } from "zerolith";
import { items } from "../store.ts";
import { AddItem } from "./add-item.ts";
import { ItemRow } from "./item.ts";

export function Packing(): View
{
    const count = computed(() => items.get().length);
    return html`
        <h1>Packing list</h1>
        <p>${count} items</p>
        <ul>${each(items, (item) => item.id, (item) => ItemRow({ item }))}</ul>
        ${AddItem()}`;
}
