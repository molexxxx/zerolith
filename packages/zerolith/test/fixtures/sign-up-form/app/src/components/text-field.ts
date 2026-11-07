// A labeled text field with its message and an optional hint.
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
    hint?: View;
}

export function TextField(props: TextFieldProps): View
{
    const { name, label, type, autocomplete, message, hint } = props;
    const invalid = computed(() => message.get() !== undefined);
    const described = hint === undefined
        ? `${name}-message`
        : `${name}-message ${name}-hint`;
    return html`
        <div class=${field}>
            <label for=${name}>${label}</label>
            <input id=${name} name=${name} type=${type} required
                autocomplete=${autocomplete} aria-invalid=${invalid}
                aria-describedby=${described}>
            ${Message({ id: `${name}-message`, text: message })}
            ${hint === undefined
                ? ""
                : html`<div id="${name}-hint">${hint}</div>`}
        </div>`;
}
