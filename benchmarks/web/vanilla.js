import { buildRows, timed } from "./common.js";

// A hand-written DOM baseline: the fastest reasonable code for the same
// operations, with no abstraction. Framework overhead is measured against it.

const tbody = document.createElement("tbody");
const table = document.createElement("table");
table.className = "table table-hover table-striped test-data";
table.append(tbody);
document.getElementById("main").append(table);

let rows = [];
let selectedRow = null;
const elements = new Map();

function rowElement(row)
{
    const tr = document.createElement("tr");
    const id = document.createElement("td");
    id.className = "col-md-1";
    id.textContent = String(row.id);
    const label = document.createElement("td");
    label.className = "col-md-4";
    const link = document.createElement("a");
    link.textContent = row.label;
    link.addEventListener("click", () => select(tr));
    label.append(link);
    const action = document.createElement("td");
    action.className = "col-md-1";
    const removeLink = document.createElement("a");
    const icon = document.createElement("span");
    icon.className = "glyphicon glyphicon-remove";
    icon.setAttribute("aria-hidden", "true");
    removeLink.append(icon);
    removeLink.addEventListener("click", () => remove(row.id));
    action.append(removeLink);
    const spacer = document.createElement("td");
    spacer.className = "col-md-6";
    tr.append(id, label, action, spacer);
    elements.set(row.id, tr);
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
    elements.clear();
    selectedRow = null;
    tbody.replaceChildren(...rows.map(rowElement));
}

function remove(id)
{
    rows = rows.filter((row) => row.id !== id);
    elements.get(id)?.remove();
    elements.delete(id);
}

globalThis.bench = {
    create: () => timed(() => setRows(buildRows(1000))),
    replace: () => timed(() => setRows(buildRows(1000))),
    partial: () => timed(() =>
    {
        for (let i = 0; i < rows.length; i += 10)
        {
            const row = rows[i];
            row.label += " !!!";
            elements.get(row.id).children[1].firstChild.textContent = row.label;
        }
    }),
    select: () => timed(() => select(elements.get(rows[1].id))),
    swap: () => timed(() =>
    {
        if (rows.length > 998)
        {
            const a = elements.get(rows[1].id);
            const b = elements.get(rows[998].id);
            const first = rows[1];
            rows[1] = rows[998];
            rows[998] = first;
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
        rows = rows.concat(added);
        tbody.append(...added.map(rowElement));
    }),
    clear: () => timed(() => setRows([])),
    count: () => document.querySelectorAll("tr").length
};
