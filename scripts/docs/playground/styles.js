import { css, html, render, signal } from "zerolith";

const card = css`
    :scope { max-width: 320px; padding: 16px; border: 2px solid currentColor; }
    h2 { margin: 0 0 8px; font-size: 1.25rem; }
    p { margin: 0 0 12px; }
`;

function Card({ title, body })
{
    const open = signal(false);
    return html`
        <article class=${card}>
            <h2>${title}</h2>
            <p>${body}</p>
            <button aria-expanded=${open} @click=${() => open.set(!open.get())}>Details</button>
        </article>`;
}

render(html`
    ${Card({ title: "Scoped styles", body: "The h2 and p rules apply inside this card only." })}
    <h2>Outside the card</h2>
    <p>This heading and paragraph keep the page's own styles.</p>`, "#app");
