// The packing list page: check items off, and add new ones.
import { type View, computed, each, html } from "zerolith";
import { add, items, toggle } from "../store.ts";

export function Packing(): View
{
    const count = computed(() => items.get().length);
    const submitted = (event: SubmitEvent): void =>
    {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const name = String(new FormData(form).get("name") ?? "").trim();
        if (name !== "")
        {
            add(name);
            form.reset();
        }
    };
    return html`
        <h1>Packing list</h1>
        <p>${count} items</p>
        <ul>
            ${each(items, (item) => item.id, (item) => html`
                <li>
                    <label>
                        <input type="checkbox" .checked=${computed(() => item.get().packed)} @change=${() => toggle(item.get().id)}>
                        ${computed(() => item.get().name)}
                    </label>
                </li>`)}
        </ul>
        <form @submit=${submitted}>
            <label>New item <input name="name" autocomplete="off" required></label>
            <button>Add</button>
        </form>`;
}
