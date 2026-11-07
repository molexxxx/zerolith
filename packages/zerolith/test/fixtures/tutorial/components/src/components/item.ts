// One row of the list. It runs once per item; its bindings follow the item.
import { type ReadableSignal, type View, computed, html } from "zerolith";
import { type Item, remove, toggle } from "../store.ts";

/**
 * Wraps a change that can take this row off the list. When the row goes,
 * focus moves to the next row, the one before, or the new item field,
 * rather than being lost with the row.
 */
function keepingFocus(change: () => void): (event: Event) => void
{
    return (event) =>
    {
        const li = (event.currentTarget as Element).closest("li");
        const next = li?.nextElementSibling ?? li?.previousElementSibling;
        change();
        if (li?.isConnected === false)
        {
            const target = next?.querySelector("input")
                ?? document.querySelector<HTMLElement>("input[name=name]");
            target?.focus();
        }
    };
}

export function ItemRow({ item }: { item: ReadableSignal<Item> }): View
{
    const name = computed(() => item.get().name);
    const packed = computed(() => item.get().packed);
    const toggled = keepingFocus(() => toggle(item.get().id));
    const removed = keepingFocus(() => remove(item.get().id));
    return html`
        <li>
            <label>
                <input type="checkbox" .checked=${packed}
                    @change=${toggled}>
                ${name}
            </label>
            <button type="button" aria-label="Remove ${name}"
                @click=${removed}>Remove</button>
        </li>`;
}
