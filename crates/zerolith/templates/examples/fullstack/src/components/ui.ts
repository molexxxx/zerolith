// Pieces every page uses: a form field wired to its message, the message a
// failure shows when no field can, and the state a list shows when it has
// nothing in it.
import type { Form } from "@zerolith/forms";
import { type ReadableSignal, type View, computed, css, html } from "zerolith";

const field = css`
    :scope { display: grid; gap: 0.375rem; }
    label { font-weight: 600; }
    output { min-height: 1.5em; color: var(--danger); font-size: 0.875rem; }
`;

const alert = css`
    :scope { margin: 0; min-height: 1.5em; color: var(--danger); font-size: 0.875rem; }
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

/** A message announced as it appears; empty when there is nothing to say. */
export function Alert({ text }: { text: ReadableSignal<string> }): View
{
    return html`<p class=${alert} role="alert">${text}</p>`;
}

/** The form's failure that no field shows: a problem without field messages, such as an expired session, or a request that never completed. */
export function FormError({ form }: { form: Form }): View
{
    return Alert({
        text: computed(() =>
        {
            const problem = form.problem.get();
            if (problem !== undefined && problem.fields === undefined)
            {
                return problem.title ?? "That did not work. Try again.";
            }
            return form.error.get() === undefined ? "" : "The server could not be reached. Try again.";
        })
    });
}

/** The message for a call that failed: the problem's title, or that the server could not be reached. */
export function failureOf(error: unknown): string
{
    return typeof error === "object" && error !== null && "problem" in error ? (error as { problem: { title?: string } }).problem.title ?? "That did not work." : "The server could not be reached.";
}

/** What a list says when it is empty. */
export function Empty({ text }: { text: string }): View
{
    return html`<p class=${empty}>${text}</p>`;
}
