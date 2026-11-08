# zerolith

A standalone frontend framework: fine-grained signals, HTML templates that need no compiler, and a runtime that loads from an import map or a bundle with no second-class path. It works with any backend over plain HTTP.

Install with `npm install zerolith`. The API is frozen at 1.0: a breaking change comes only in a major, after a deprecation notice, and the [support policy](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md) says how long a line gets fixes. The guides, the API reference, and a page for every diagnostic code are on the [docs site](https://zerolith.dev/), and the direction is in the [roadmap](https://github.com/molexxxx/zerolith/blob/main/docs/ROADMAP.md).

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

`render` mounts a view into an element, named by a CSS selector or passed as the element itself, and returns a root whose `dispose()` takes it down again. Given a function that returns the view, as `render(() => App(), "#app")`, it calls the function inside the root's owner, so the effects and `onDispose` cleanups a component registers end with the root; an application's entry mounts its layout that way.

## The one rule to learn first

Bind the signal, not its value.

```ts
html`<p>${count}</p>`                              // live: updates when count changes
html`<p>${computed(() => item.get().name)}</p>`    // live: derived value
html`<p>${count.get()}</p>`                        // frozen: read once at creation, never updates
```

Both forms type-check, and the runtime cannot tell a frozen read from a deliberate one-time value, so it does not warn; `zerolith lint`, which a starter's `npm run check` runs, reads the source and reports `template_frozen_read`. Call `.get()` only inside `computed`, `effect`, `resource.params`, and event handlers.

## Styles

A component's styles are scoped to it by the browser's `@scope` rule, with no shadow DOM, so global styles and design tokens still reach in. Write them in a `css` literal beside the markup, or keep a longer stylesheet in a file of its own and import it with `?scoped`:

```ts
import { css, html } from "zerolith";
import card from "./card.css?scoped";

const badge = css`:scope { padding: 4px 8px; border: 2px solid; }`;

function Card({ title }: { title: string })
{
    return html`
        <article class=${card}>
            <h2>${title}</h2>
            <span class=${badge}>New</span>
        </article>`;
}
```

Both give the same value, bound to a root element's `class`. A `?scoped` import needs `zerolith dev` and `zerolith build` from `@zerolith/cli`, or the Vite plugin, and `/// <reference types="zerolith/imports" />` in the project's `env.d.ts` types it.

## Principles

- One reactivity model: `signal`, `computed`, `effect`, `batch`, `resource`, with the TC39 Signals vocabulary (`.get()`, `.set()`).
- One authoring form: a plain TypeScript function returning an `html` tagged template. No compiler is required; the compiler is an optimizer.
- No virtual DOM: templates are instantiated once and bound part by part.
- Zero runtime dependencies and no install scripts, enforced by tests.
- Works under a strict `script-src 'self'` CSP and with Trusted Types enforced.

## Documentation

- The [introduction](https://zerolith.dev/guide/) starts a project, and the [signals](https://zerolith.dev/guide/signals/) and [templates](https://zerolith.dev/guide/templates/) guides explain the core, every example run as a test.
- The [reference](https://zerolith.dev/reference/zerolith/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://zerolith.dev/learn/) builds an app step by step, and the [playground](https://zerolith.dev/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
