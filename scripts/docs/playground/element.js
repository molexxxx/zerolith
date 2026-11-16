/*
 * Custom elements: a zerolith view behind a tag any page can use, from
 * zerolith/element. Each declared prop is an attribute and a property,
 * and both feed one signal, which the view binds. What the tag holds
 * arrives as children. The element tells its page what happened with
 * an ordinary event, so a page in React, Vue, or plain HTML can use it.
 *
 * Try: press a star. <star-rating> dispatches "rate", and the page,
 * which owns the number, sets the element's value property. Change
 * max="5" in the template at the bottom to 10 and press Run.
 */
import { computed, css, each, html, render, signal } from "zerolith";
import { define } from "zerolith/element";

const stars = css`
    :scope { display: flex; gap: 4px; }
    button { min-width: 44px; padding-inline: 0; }
    button[aria-pressed="true"] {
        border-color: var(--text);
        background: var(--text);
        color: var(--bg);
    }
`;

define("star-rating", {
    props: ["value", "max"],
    view: ({ value, max }, element) =>
    {
        const count = computed(() => Number(max.get() ?? 5));
        const chosen = computed(() => Number(value.get() ?? 0));
        const steps = computed(() =>
            Array.from({ length: count.get() }, (_, index) => index + 1));
        const rate = (star) => element.dispatchEvent(
            new CustomEvent("rate", { detail: star, bubbles: true }));
        return html`
            <div class=${stars} role="group" aria-label="Rating">
                ${each(steps, (star) => star, (star) => html`
                    <button
                        aria-pressed=${computed(() =>
                            String(star.get() <= chosen.get()))}
                        @click=${() => rate(star.get())}>
                        ${star}
                    </button>`)}
            </div>`;
    }
});

define("note-card", {
    props: ["heading"],
    view: ({ heading, children }) => html`
        <article>
            <h2>${heading}</h2>
            <div>${children}</div>
        </article>`
});

const panel = css`
    :scope {
        display: grid;
        gap: 16px;
        max-width: 460px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    article { display: grid; gap: 8px; }
    h2 { font-size: 24px; }
    p { margin: 0; }
    .said { color: var(--muted); font-family: var(--font-mono); }
`;

const rating = signal(3);
const said = computed(() => `The page holds ${rating.get()}.`);

render(html`
    <section class=${panel}>
        <note-card heading="Field guide">
            <p>The heading is an attribute. This text is <b>children</b>.</p>
        </note-card>
        <star-rating max="5" .value=${rating}
            @rate=${(event) => rating.set(event.detail)}></star-rating>
        <p class="said">${said}</p>
    </section>`, "#app");
