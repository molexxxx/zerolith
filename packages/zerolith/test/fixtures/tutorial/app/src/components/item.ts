// One row of the list, with styles that apply to this row and nothing else.
import { type ReadableSignal, type View, computed, css, html } from "zerolith";
import { type Item, remove, toggle } from "../store.ts";

const row = css`
    :scope { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 2px solid var(--line); }
    label { display: flex; align-items: center; gap: 0.75rem; flex: 1; }
    :scope[data-packed="true"] label { color: var(--muted); text-decoration: line-through; }
`;

export function ItemRow({ item }: { item: ReadableSignal<Item> }): View
{
    const name = computed(() => item.get().name);
    const packed = computed(() => item.get().packed);
    return html`
        <li class=${row} data-packed=${packed}>
            <label>
                <input type="checkbox" .checked=${packed} @change=${() => toggle(item.get().id)}>
                ${name}
            </label>
            <button type="button" aria-label="Remove ${name}" @click=${() => remove(item.get().id)}>Remove</button>
        </li>`;
}
