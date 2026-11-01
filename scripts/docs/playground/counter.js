/*
 * Counter: a signal, a value derived from it, an effect, and event
 * handlers. The template binds the signals themselves, so a click
 * updates two text nodes and nothing else; Counter does not run again.
 *
 * Try: click Add one and watch the console under the preview, where the
 * effect prints every new count. Then make doubled triple the count and
 * press Run.
 */
import { computed, css, effect, html, render, signal } from "zerolith";

const count = signal(0);
const doubled = computed(() => count.get() * 2);

effect(() => console.log("count is", count.get()));

const panel = css`
    :scope {
        display: grid;
        gap: 24px;
        max-width: 360px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    output {
        font: 600 96px/1 var(--font-display);
        letter-spacing: -0.04em;
    }
    p { margin: 0; color: var(--muted); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
`;

function Counter()
{
    const add = () => count.set(count.get() + 1);
    const reset = () => count.set(0);
    return html`
        <section class=${panel} aria-label="Counter">
            <output>${count}</output>
            <p>Doubled, a computed value: ${doubled}</p>
            <div class="actions">
                <button class="primary" @click=${add}>Add one</button>
                <button @click=${reset}>Reset</button>
            </div>
        </section>`;
}

render(() => Counter(), "#app");
