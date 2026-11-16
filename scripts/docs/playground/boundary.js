/*
 * Context and an error boundary. context gives a value to everything a
 * function creates, with no prop passed through each level: Price reads
 * the currency two components down, and the same Basket shows twice,
 * under two currencies. boundary shows a fallback in place of the part
 * of a view that throws, and the rest of the page keeps running.
 *
 * Try: change a count, which both baskets follow. Press "Lose the
 * prices": each total throws, its boundary shows the message in its
 * place, and the rows above still count. The console shows the error
 * each boundary caught. Press Try again.
 */
import {
    boundary, computed, context, css, each, html, render, signal
} from "zerolith";

const Currency = context("USD");

const items = signal([
    { id: 1, name: "Tent", price: 240, count: 1 },
    { id: 2, name: "Stove", price: 65, count: 2 }
]);
const lost = signal(false);

const panel = css`
    :scope {
        display: grid;
        gap: 16px;
        max-width: 640px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    h2 { font-size: 20px; }
    .baskets {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 24px;
    }
    ul { margin: 0; padding: 0; list-style: none; }
    li {
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 8px 0;
        border-bottom: 2px solid var(--line);
    }
    li span:first-child { flex: 1; }
    .price { font-family: var(--font-mono); }
    .total { margin: 12px 0 0; font-weight: 600; }
    [role="alert"] { margin: 12px 0 8px; color: var(--muted); }
`;

function change(id, by)
{
    items.set(items.get().map((item) => (item.id === id
        ? { ...item, count: Math.max(0, item.count + by) }
        : item)));
}

/** An amount in the currency provided around this component. */
function Price(amount)
{
    const format = new Intl.NumberFormat("en", {
        style: "currency",
        currency: Currency.read()
    });
    const text = computed(() => format.format(amount.get()));
    return html`<span class="price">${text}</span>`;
}

function Row(item)
{
    const { id } = item.get();
    const cost = computed(() => item.get().price * item.get().count);
    return html`
        <li>
            <span>${computed(() => item.get().name)}
                x ${computed(() => item.get().count)}</span>
            ${Price(cost)}
            <button aria-label="One fewer" @click=${() => change(id, -1)}>
                -
            </button>
            <button aria-label="One more" @click=${() => change(id, 1)}>
                +
            </button>
        </li>`;
}

function Total()
{
    const total = computed(() =>
    {
        if (lost.get())
        {
            throw new Error("The prices did not load.");
        }
        return items.get().reduce((sum, item) =>
            sum + item.price * item.count, 0);
    });
    return html`<p class="total">Total ${Price(total)}</p>`;
}

/** What a boundary shows in place of its content: the error, and a retry. */
function showProblem(error, retry)
{
    const again = () =>
    {
        lost.set(false);
        retry();
    };
    const text = error instanceof Error ? error.message : "It failed.";
    return html`
        <p role="alert">${text}</p>
        <button @click=${again}>Try again</button>`;
}

function Basket()
{
    return html`
        <div>
            <h2>In ${Currency.read()}</h2>
            <ul>${each(items, (item) => item.id, Row)}</ul>
            ${boundary(() => Total(), showProblem)}
        </div>`;
}

render(() => html`
    <section class=${panel}>
        <div class="baskets">
            ${Basket()}
            ${Currency.provide("EUR", () => Basket())}
        </div>
        <button @click=${() => lost.set(true)}>Lose the prices</button>
    </section>`, "#app");
