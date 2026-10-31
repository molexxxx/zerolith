// The buttons that choose which items the list shows.
import { type View, computed, html } from "zerolith";
import { type Filter, filter } from "../store.ts";

const choices: Array<{ value: Filter; label: string }> = [
    { value: "all", label: "All" },
    { value: "left", label: "Left to pack" },
    { value: "packed", label: "Packed" }
];

export function Filters(): View
{
    return html`
        <div role="group" aria-label="Show">
            ${choices.map(({ value, label }) => html`
                <button type="button" aria-pressed=${computed(() => filter.get() === value)} @click=${() => filter.set(value)}>${label}</button>`)}
        </div>`;
}
