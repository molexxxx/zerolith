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
    :scope {
        display: inline-block;
        padding: 6px 10px;
        border: 2px solid var(--control);
    }
    p {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 12px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
`;

const card = css`
    :scope {
        display: grid;
        gap: 12px;
        justify-items: start;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    h2 { font-size: calc(var(--size) * 1px); }
    p { margin: 0; font-weight: 700; }
`;

const page = css`
    :scope { display: grid; gap: 24px; max-width: 420px; }
    label { display: grid; gap: 8px; }
    span {
        color: var(--muted);
        font: 12px var(--font-mono);
        letter-spacing: 0.06em;
        text-transform: uppercase;
    }
    output { color: var(--text); }
`;

const size = signal(32);

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
    <div class=${page}>
        ${Card()}
        <label>
            <span>Heading size <output>${size}px</output></span>
            <input type="range" min="16" max="48" .value=${size}
                @input=${resize}>
        </label>
    </div>`, "#app");
