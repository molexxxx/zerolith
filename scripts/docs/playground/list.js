/*
 * Packing list: a keyed list with each, a form that adds to it, and a
 * count derived from the list. A row keeps its element while its key
 * stays, so checking an item touches only that row and the count.
 *
 * Try: check items off and add one with the form. Then add a fourth
 * starting item to the list in the code and press Run.
 */
import { computed, each, html, render, signal } from "zerolith";

const items = signal([
    { id: 1, name: "Passport", packed: true },
    { id: 2, name: "Charger", packed: false },
    { id: 3, name: "Rain jacket", packed: false }
]);
const packed = computed(() =>
    items.get().filter((item) => item.packed).length);
const total = computed(() => items.get().length);

function toggle(id)
{
    items.set(items.get().map((item) =>
        item.id === id ? { ...item, packed: !item.packed } : item));
}

function add(event)
{
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("name");
    const name = field.value.trim();
    if (name !== "")
    {
        const id = Math.max(0, ...items.get().map((item) => item.id)) + 1;
        items.set([...items.get(), { id, name, packed: false }]);
        field.value = "";
    }
}

function Item(item)
{
    const { id } = item.get();
    return html`
        <li>
            <label>
                <input type="checkbox"
                    .checked=${computed(() => item.get().packed)}
                    @change=${() => toggle(id)}>
                ${computed(() => item.get().name)}
            </label>
        </li>`;
}

render(html`
    <h1>Packing list</h1>
    <p>${packed} of ${total} packed</p>
    <ul>${each(items, (item) => item.id, Item)}</ul>
    <form @submit=${add}>
        <label>Item <input name="name" autocomplete="off"></label>
        <button>Add</button>
    </form>`, "#app");
