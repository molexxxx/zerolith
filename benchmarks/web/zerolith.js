import { computed, each, html, render, signal } from "zerolith";
import { buildRows, timed } from "./common.js";

const rows = signal([]);
const selected = signal(0);

function remove(id)
{
    rows.set(rows.get().filter((row) => row.id !== id));
}

function Row(row)
{
    const id = computed(() => row.get().id);
    const label = computed(() => row.get().label);
    const className = computed(() => (selected.get() === id.get() ? "danger" : ""));
    return html`
        <tr class=${className}>
            <td class="col-md-1">${id}</td>
            <td class="col-md-4"><a @click=${() => selected.set(id.get())}>${label}</a></td>
            <td class="col-md-1"><a @click=${() => remove(id.get())}><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
            <td class="col-md-6"></td>
        </tr>`;
}

render(html`<table class="table table-hover table-striped test-data"><tbody>${each(rows, (row) => row.id, Row)}</tbody></table>`, document.getElementById("main"));

globalThis.bench = {
    create: () => timed(() => rows.set(buildRows(1000))),
    replace: () => timed(() => rows.set(buildRows(1000))),
    partial: () => timed(() => rows.set(rows.get().map((row, index) => (index % 10 === 0 ? { id: row.id, label: row.label + " !!!" } : row)))),
    select: () => timed(() => selected.set(rows.get()[1].id)),
    swap: () => timed(() =>
    {
        const list = rows.get().slice();
        if (list.length > 998)
        {
            const first = list[1];
            list[1] = list[998];
            list[998] = first;
            rows.set(list);
        }
    }),
    remove: () => timed(() => remove(rows.get()[1].id)),
    createMany: () => timed(() => rows.set(buildRows(10000))),
    append: () => timed(() => rows.set([...rows.get(), ...buildRows(1000)])),
    clear: () => timed(() => rows.set([])),
    count: () => document.querySelectorAll("tr").length
};
