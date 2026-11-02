import { buildRows, timed } from "./common.js";

// A hand-written DOM baseline: the fastest reasonable code for the same
// operations, with no abstraction, written as the fastest hand-written
// entries of js-framework-benchmark are: each row is a copy of one prepared
// row, filled through the text nodes the copy already holds, and one listener
// on the table body serves both links of every row. Framework overhead is
// measured against it.

const tbody = document.createElement("tbody");
const table = document.createElement("table");
table.className = "table table-hover table-striped test-data";
table.append(tbody);
document.getElementById("main").append(table);

const prepared = document.createElement("tr");
prepared.innerHTML = "<td class=\"col-md-1\"> </td><td class=\"col-md-4\"><a> </a></td><td class=\"col-md-1\"><a><span class=\"glyphicon glyphicon-remove\" aria-hidden=\"true\"></span></a></td><td class=\"col-md-6\"></td>";

let rows = [];
let elements = [];
let selectedRow = null;

function rowElement(row)
{
    const tr = prepared.cloneNode(true);
    const id = tr.firstChild;
    id.firstChild.nodeValue = row.id;
    id.nextSibling.firstChild.firstChild.nodeValue = row.label;
    tr.rowId = row.id;
    return tr;
}

function select(tr)
{
    if (selectedRow !== null)
    {
        selectedRow.className = "";
    }
    selectedRow = tr;
    tr.className = "danger";
}

function setRows(next)
{
    rows = next;
    elements = next.map(rowElement);
    selectedRow = null;
    tbody.replaceChildren(...elements);
}

function remove(id)
{
    const index = rows.findIndex((row) => row.id === id);
    const tr = elements[index];
    rows.splice(index, 1);
    elements.splice(index, 1);
    if (tr === selectedRow)
    {
        selectedRow = null;
    }
    tr.remove();
}

tbody.addEventListener("click", (event) =>
{
    const link = event.target.closest("a");
    if (link !== null)
    {
        const tr = link.closest("tr");
        if (link.parentNode.className === "col-md-4")
        {
            select(tr);
        }
        else
        {
            remove(tr.rowId);
        }
    }
});

globalThis.bench = {
    create: () => timed(() => setRows(buildRows(1000))),
    replace: () => timed(() => setRows(buildRows(1000))),
    partial: () => timed(() =>
    {
        for (let i = 0; i < rows.length; i += 10)
        {
            const row = rows[i];
            row.label += " !!!";
            elements[i].firstChild.nextSibling.firstChild.firstChild.nodeValue = row.label;
        }
    }),
    select: () => timed(() => select(elements[1])),
    swap: () => timed(() =>
    {
        if (rows.length > 998)
        {
            const a = elements[1];
            const b = elements[998];
            const first = rows[1];
            rows[1] = rows[998];
            rows[998] = first;
            elements[1] = b;
            elements[998] = a;
            const afterA = a.nextSibling;
            tbody.insertBefore(a, b.nextSibling);
            tbody.insertBefore(b, afterA);
        }
    }),
    remove: () => timed(() => remove(rows[1].id)),
    createMany: () => timed(() => setRows(buildRows(10000))),
    append: () => timed(() =>
    {
        const added = buildRows(1000);
        const created = added.map(rowElement);
        rows = rows.concat(added);
        elements = elements.concat(created);
        tbody.append(...created);
    }),
    clear: () => timed(() =>
    {
        rows = [];
        elements = [];
        selectedRow = null;
        tbody.textContent = "";
    }),
    count: () => document.querySelectorAll("tr").length
};
