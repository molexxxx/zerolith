# zerolith

A standalone frontend framework: fine-grained signals, HTML templates that need no compiler, and a runtime that loads from an import map or a bundle with no second-class path. It works with any backend over plain HTTP.

Status: alpha. Install with `npm install zerolith@alpha`; the API may change before 1.0. The guides, the API reference, and a page for every diagnostic code are on the [docs site](https://molexxxx.github.io/zerolith/), and the direction is in the [roadmap](https://github.com/molexxxx/zerolith/blob/main/docs/ROADMAP.md).

## A first component

```ts
import { computed, html, render, signal } from "zerolith";

function Counter({ start = 0 }: { start?: number })
{
    const count = signal(start);
    const doubled = computed(() => count.get() * 2);
    return html`
        <p>Count: ${count}, doubled: ${doubled}</p>
        <button @click=${() => count.set(count.get() + 1)}>Add one</button>`;
}

render(Counter({ start: 1 }), "#app");
```

`render` mounts a view into an element, named by a CSS selector or passed as the element itself, and returns a root whose `dispose()` takes it down again.

## The one rule to learn first

Bind the signal, not its value.

```ts
html`<p>${count}</p>`                              // live: updates when count changes
html`<p>${computed(() => item.get().name)}</p>`    // live: derived value
html`<p>${count.get()}</p>`                        // frozen: read once at creation, never updates
```

Both forms type-check, and the runtime cannot tell a frozen read from a deliberate one-time value, so no warning is possible. Call `.get()` only inside `computed`, `effect`, `resource.params`, and event handlers.

## Principles

- One reactivity model: `signal`, `computed`, `effect`, `batch`, `resource`, with the TC39 Signals vocabulary (`.get()`, `.set()`).
- One authoring form: a plain TypeScript function returning an `html` tagged template. No compiler is required; the compiler is an optimizer.
- No virtual DOM: templates are instantiated once and bound part by part.
- Zero runtime dependencies and no install scripts, enforced by tests.
- Works under a strict `script-src 'self'` CSP and with Trusted Types enforced.

## Documentation

- The [introduction](https://molexxxx.github.io/zerolith/guide/) starts a project, and the [signals](https://molexxxx.github.io/zerolith/guide/signals/) and [templates](https://molexxxx.github.io/zerolith/guide/templates/) guides explain the core, every example run as a test.
- The [reference](https://molexxxx.github.io/zerolith/reference/zerolith/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://molexxxx.github.io/zerolith/learn/) builds an app step by step, and the [playground](https://molexxxx.github.io/zerolith/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
