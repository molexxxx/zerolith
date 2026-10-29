import { html, signal } from "zerolith";

const label = "Count";

export function Counter(): unknown
{
    const count = signal(0, { name: "count" });
    return html`<p data-testid="count">${label}: ${count}</p><button data-testid="increment" @click=${() => count.set(count.get() + 1)}>+</button>`;
}
