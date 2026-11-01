/*
 * Counter: a signal, a value derived from it, an effect, and an event
 * handler. The template binds the signals themselves, so a click
 * updates two text nodes and nothing else; Counter does not run again.
 *
 * Try: click Add one and watch the console under the preview, where the
 * effect prints every new count. Then make doubled triple the count and
 * press Run.
 */
import { computed, effect, html, render, signal } from "zerolith";

const count = signal(0);
const doubled = computed(() => count.get() * 2);

effect(() => console.log("count is", count.get()));

function Counter()
{
    const add = () => count.set(count.get() + 1);
    return html`
        <p>Count: ${count}, doubled: ${doubled}</p>
        <button @click=${add}>Add one</button>`;
}

render(Counter(), "#app");
