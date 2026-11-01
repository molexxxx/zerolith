/*
 * Packing list: a keyed list with each, a form that adds to it, and a
 * count derived from the list. A row keeps its element while its key
 * stays, so checking an item touches only that row and the count.
 *
 * Try: check items off and add one with the form. Then add a fourth
 * starting item to the list in the code and press Run.
 */
import { computed, css, each, html, render, signal } from "zerolith";

const items = signal([
    { id: 1, name: "Passport", packed: true },
    { id: 2, name: "Charger", packed: false },
    { id: 3, name: "Rain jacket", packed: false }
]);
const packed = computed(() =>
    items.get().filter((item) => item.packed).length);
const total = computed(() => items.get().length);

const panel = css`
    :scope {
        display: grid;
        gap: 16px;
        max-width: 420px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    h1 { font-size: 32px; }
    .count { margin: 0; color: var(--muted); font-family: var(--font-mono); }
    ul { margin: 0; border-top: 2px solid var(--line); }
    li { padding: 12px 0; border-bottom: 2px solid var(--line); }
    li label { display: flex; }
    li:has(:checked) { color: var(--muted); text-decoration: line-through; }
    form { display: flex; gap: 8px; }
    input[name="name"] { flex: 1; min-width: 0; }
`;

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
    <section class=${panel}>
        <h1>Packing list</h1>
        <p class="count">${packed} of ${total} packed</p>
        <progress max=${total} value=${packed}></progress>
        <ul>${each(items, (item) => item.id, Item)}</ul>
        <form @submit=${add}>
            <input name="name" aria-label="Item" placeholder="Add an item"
                autocomplete="off">
            <button>Add</button>
        </form>
    </section>`, "#app");
