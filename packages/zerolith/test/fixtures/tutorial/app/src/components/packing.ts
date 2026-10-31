// The packing list page: progress, the filters, the rows, and a note when
// the filter leaves nothing to show.
import { type View, computed, css, each, html, when } from "zerolith";
import { items, packedCount, shown } from "../store.ts";
import { AddItem } from "./add-item.ts";
import { Filters } from "./filters.ts";
import { ItemRow } from "./item.ts";

const page = css`
    :scope { display: grid; gap: 1.5rem; }
    h1, p { margin: 0; }
    ul { margin: 0; padding: 0; list-style: none; border-top: 2px solid var(--line); }
`;

export function Packing(): View
{
    const total = computed(() => items.get().length);
    const empty = computed(() => shown.get().length === 0);
    return html`
        <section class=${page}>
            <h1>Packing list</h1>
            <p>${packedCount} of ${total} packed</p>
            ${Filters()}
            <ul>${each(shown, (item) => item.id, (item) => ItemRow({ item }))}</ul>
            ${when(empty, () => html`<p>Nothing to show here.</p>`)}
            ${AddItem()}
        </section>`;
}
