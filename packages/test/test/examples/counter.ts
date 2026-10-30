// The component the testing guide's examples test.
import { type View, html, signal } from "zerolith";

export function Counter(): View
{
    const count = signal(0);
    return html`<button @click=${() => count.set(count.get() + 1)}>Clicked ${count} times</button>`;
}
