// Pieces every page uses: a form field wired to its message, and the state a
// list shows when it has nothing in it.
import type { Form } from "@zerolith/forms";
import { type View, css, html } from "zerolith";

const field = css`
    :scope { display: grid; gap: 0.375rem; }
    label { font-weight: 600; }
    output { min-height: 1.5em; color: var(--danger); font-size: 0.875rem; }
`;

const empty = css`
    :scope { margin: 0; padding: 2rem 1.5rem; border: 2px dashed var(--line); color: var(--muted); text-align: center; }
`;

/** What a field asks for and how it is filled in. */
export interface FieldProps
{
    form: Form;
    name: string;
    label: string;
    type?: "text" | "email" | "password" | "date";
    multiline?: boolean;
    required?: boolean;
    autocomplete?: string;
}

/** A labeled input whose message comes from the form's problem, read with the input by assistive technology. */
export function Field({ form, name, label, type = "text", multiline = false, required = false, autocomplete }: FieldProps): View
{
    const id = `field-${name}`;
    const message = `${id}-message`;
    const { invalid, error } = form.field(name);
    const control = multiline
        ? html`<textarea id=${id} name=${name} rows="3" ?required=${required} aria-invalid=${invalid} aria-describedby=${message}></textarea>`
        : html`<input id=${id} name=${name} type=${type} ?required=${required} autocomplete=${autocomplete} aria-invalid=${invalid} aria-describedby=${message}>`;
    return html`
        <div class=${field}>
            <label for=${id}>${label}</label>
            ${control}
            <output id=${message}>${error}</output>
        </div>`;
}

/** What a list says when it is empty. */
export function Empty({ text }: { text: string }): View
{
    return html`<p class=${empty}>${text}</p>`;
}
