// The form that adds an item, with the field it clears after each one.
import { type View, html } from "zerolith";
import { add } from "../store.ts";

export function AddItem(): View
{
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
        <form @submit=${submitted}>
            <label>New item <input name="name" autocomplete="off" required></label>
            <button>Add</button>
        </form>`;
}
