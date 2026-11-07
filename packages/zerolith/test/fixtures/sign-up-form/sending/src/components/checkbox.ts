// A checkbox inside its label, with its message.
import { type View, computed, css, html } from "zerolith";
import { Message, type MessageText } from "./message.ts";

const field = css`
    :scope { display: grid; gap: 0.375rem; }
    label { flex-wrap: nowrap; }
`;

export interface CheckboxProps
{
    name: string;
    value: string;
    label: string;
    message: MessageText;
}

export function Checkbox({ name, value, label, message }: CheckboxProps): View
{
    const invalid = computed(() => message.get() !== undefined);
    return html`
        <div class=${field}>
            <label>
                <input type="checkbox" name=${name} value=${value} required
                    aria-invalid=${invalid} aria-describedby="${name}-message">
                ${label}
            </label>
            ${Message({ id: `${name}-message`, text: message })}
        </div>`;
}
