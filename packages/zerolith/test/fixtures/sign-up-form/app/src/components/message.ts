// A field's message: what to change so the field passes.
import { type ReadableSignal, type View, css, html } from "zerolith";

const message = css`
    :scope { margin: 0; color: var(--danger); font-size: 0.875rem; }
`;

/** A message that can change, or undefined while there is nothing to say. */
export type MessageText = ReadableSignal<string | undefined>;

export function Message({ id, text }: { id: string; text: MessageText }): View
{
    return html`<p id=${id} class=${message}>${text}</p>`;
}
