/*
 * Scoped styles: each css literal styles its own component and stops at
 * the components inside it, with no shadow DOM. A value that changes
 * goes in a custom property, set through a style binding.
 *
 * Try: drag the slider. Note that the card's p rule makes its own
 * paragraph bold but never reaches the paragraph inside the badge.
 */
import { computed, css, html, render, signal } from "zerolith";

const badge = css`
    :scope { display: inline-block; padding: 4px 8px; border: 2px solid; }
    p { margin: 0; font-size: 12px; text-transform: uppercase; }
`;

const card = css`
    :scope { max-width: 360px; padding: 16px; border: 4px solid; }
    h2 { margin: 0 0 8px; font-size: calc(var(--size) * 1px); }
    p { margin: 0 0 12px; font-weight: 700; }
`;

const size = signal(24);

function Badge({ text })
{
    return html`<div class=${badge}><p>${text}</p></div>`;
}

function Card()
{
    const style = computed(() => `--size: ${size.get()}`);
    return html`
        <article class=${card} style=${style}>
            <h2>Scoped styles</h2>
            <p>The card's own paragraph is bold.</p>
            ${Badge({ text: "The badge's is not" })}
        </article>`;
}

const resize = (event) => size.set(Number(event.target.value));

render(html`
    ${Card()}
    <label>Heading size ${size}px
        <input type="range" min="16" max="48" .value=${size}
            @input=${resize}>
    </label>`, "#app");
