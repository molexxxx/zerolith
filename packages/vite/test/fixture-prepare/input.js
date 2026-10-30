import { html as h, render } from "zerolith";
import * as z from "zerolith";
import { other } from "./other.js";

export function Row(item, onPick)
{
    return h`<li class="row ${item.kind}" ?selected=${item.selected} @click=${onPick} .value=${item.id}>${item.label}</li>`;
}

export const List = (items) => z.html`
    <ul title='list' data-count=${items.length}>
        ${items.map((item) => Row(item, other))}
        <li class="empty ${items.length === 0 ? "shown" : ""}">${"nothing"} ${h`<em>yet</em>`}</li>
    </ul>
`;

render(List([]), "#app");
