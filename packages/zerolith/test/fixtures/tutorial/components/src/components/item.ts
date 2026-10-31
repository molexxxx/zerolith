// One row of the list. It runs once per item; its bindings follow the item.
import { type ReadableSignal, type View, computed, html } from "zerolith";
import { type Item, remove, toggle } from "../store.ts";

export function ItemRow({ item }: { item: ReadableSignal<Item> }): View
{
    const name = computed(() => item.get().name);
    const packed = computed(() => item.get().packed);
    return html`
        <li>
            <label>
                <input type="checkbox" .checked=${packed} @change=${() => toggle(item.get().id)}>
                ${name}
            </label>
            <button type="button" aria-label="Remove ${name}" @click=${() => remove(item.get().id)}>Remove</button>
        </li>`;
}
