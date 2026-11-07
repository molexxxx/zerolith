// A page's heading, which takes the keyboard focus when the page opens.
import { type View, css, html } from "zerolith";

const heading = css`
    :scope:focus { outline: none; }
`;

/**
 * Moves focus to the element once it is in the document. Scrolling stays
 * with the router, which restores the position on the back button.
 */
function focusOnOpen(element: Element): void
{
    queueMicrotask(() =>
        (element as HTMLElement).focus({ preventScroll: true }));
}

export function PageHeading({ text }: { text: string }): View
{
    return html`
        <h1 class=${heading} tabindex="-1" ref=${focusOnOpen}>${text}</h1>`;
}
