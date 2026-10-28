# zerolith

The front end of the zero-server pair: a signals runtime that runs from an import map or a bundle with no second-class path, typed from Rust struct to browser signal, with every documented example executed in CI and every dev tool working wherever the app is served.

Status: pre-alpha. Nothing is published yet. The design is recorded in the repository's `docs/research/` folder and the decisions in `docs/decisions/`.

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

## License

Apache-2.0. See `LICENSE`.
