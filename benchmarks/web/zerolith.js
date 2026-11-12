import { batch, computed, each, html, render, signal } from "zerolith";
import { buildRows, timed } from "./common.js";

const rows = signal([]);
const selected = signal(0);

/** Rows as the js-framework-benchmark entry makes them, each label a signal of its own. */
function signalRows(count)
{
    return buildRows(count).map((row) => ({ id: row.id, label: signal(row.label) }));
}

function remove(id)
{
    rows.set(rows.get().filter((row) => row.id !== id));
}

/** One table row, as in the js-framework-benchmark entry: the id and the label's signal are read once, and the label and the selection stay live. The markup stays on one line, as the entry's does, so no whitespace text nodes sit between the cells, where the vanilla page has none. */
function Row(row)
{
    const { id, label } = row.get();
    const className = computed(() => (selected.get() === id ? "danger" : ""));
    return html`<tr class=${className}><td class="col-md-1">${id}</td><td class="col-md-4"><a @click=${() => selected.set(id)}>${label}</a></td><td class="col-md-1"><a @click=${() => remove(id)}><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td><td class="col-md-6"></td></tr>`;
}

render(html`<table class="table table-hover table-striped test-data"><tbody>${each(rows, (row) => row.id, Row)}</tbody></table>`, "#main");

globalThis.bench = {
    create: () => timed(() => rows.set(signalRows(1000))),
    replace: () => timed(() => rows.set(signalRows(1000))),
    partial: () => timed(() => batch(() =>
    {
        const list = rows.get();
        for (let index = 0; index < list.length; index += 10)
        {
            list[index].label.set(list[index].label.get() + " !!!");
        }
    })),
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
    createMany: () => timed(() => rows.set(signalRows(10000))),
    append: () => timed(() => rows.set([...rows.get(), ...signalRows(1000)])),
    clear: () => timed(() => rows.set([])),
    count: () => document.querySelectorAll("tr").length
};
