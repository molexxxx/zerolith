import { computed, html, render, signal } from "zerolith";

const count = signal(0);
const doubled = computed(() => count.get() * 2);

function Counter()
{
    const add = () => count.set(count.get() + 1);
    return html`
        <p>Count: ${count}, doubled: ${doubled}</p>
        <button @click=${add}>Add one</button>`;
}

render(Counter(), "#app");

// Bind the signal, not its value: ${count} stays live, ${count.get()} would read once.
console.log("Counter mounted with", count.get());
