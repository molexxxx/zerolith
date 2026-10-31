import { computed, each, html, render, signal } from "zerolith";

const items = signal([
    { id: 1, name: "Passport", packed: true },
    { id: 2, name: "Charger", packed: false },
    { id: 3, name: "Rain jacket", packed: false }
]);
const packed = computed(() => items.get().filter((item) => item.packed).length);
let nextId = 4;

function toggle(id)
{
    items.set(items.get().map((item) => (item.id === id ? { ...item, packed: !item.packed } : item)));
}

function add(event)
{
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("name");
    const name = field.value.trim();
    if (name !== "")
    {
        items.set([...items.get(), { id: nextId++, name, packed: false }]);
        field.value = "";
    }
}

function Item(item)
{
    const name = computed(() => item.get().name);
    const checked = computed(() => item.get().packed);
    return html`
        <li>
            <label>
                <input type="checkbox" .checked=${checked} @change=${() => toggle(item.get().id)}>
                ${name}
            </label>
        </li>`;
}

render(html`
    <h1>Packing list</h1>
    <p>${packed} of ${computed(() => items.get().length)} packed</p>
    <ul>${each(items, (item) => item.id, Item)}</ul>
    <form @submit=${add}>
        <label>Item <input name="name" autocomplete="off"></label>
        <button>Add</button>
    </form>`, "#app");
