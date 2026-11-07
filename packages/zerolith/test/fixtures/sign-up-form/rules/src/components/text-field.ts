// A labeled text field with its message.
import { type View, computed, css, html } from "zerolith";
import { Message, type MessageText } from "./message.ts";

const field = css`
    :scope { display: grid; gap: 0.375rem; }
    label { font-weight: 600; }
`;

export interface TextFieldProps
{
    name: string;
    label: string;
    type: "text" | "email" | "password";
    autocomplete: string;
    message: MessageText;
}

export function TextField(props: TextFieldProps): View
{
    const { name, label, type, autocomplete, message } = props;
    const invalid = computed(() => message.get() !== undefined);
    return html`
        <div class=${field}>
            <label for=${name}>${label}</label>
            <input id=${name} name=${name} type=${type} required
                autocomplete=${autocomplete} aria-invalid=${invalid}
                aria-describedby="${name}-message">
            ${Message({ id: `${name}-message`, text: message })}
        </div>`;
}
