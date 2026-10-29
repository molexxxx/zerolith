---
title: zerolith
description: A standalone frontend framework with fine-grained signals, HTML templates that need no compiler, typed routing, and tooling that works wherever the app is served.
order: 0
---

# zerolith

A standalone frontend framework. Fine-grained signals drive HTML templates that need no compiler, a typed router handles navigation, and the same files run from an import map in the browser or through a bundler. It talks to any backend over plain HTTP.

Status: pre-alpha. The API is small on purpose and is being frozen; nothing is published to npm yet.

## The one rule to learn first

Bind the signal, not its value.

```ts
html`<p>${count}</p>`;                              // live: updates when count changes
html`<p>${computed(() => item.get().name)}</p>`;    // live: derived value
html`<p>${count.get()}</p>`;                        // frozen: read once at creation, never updates
```

Both forms type-check, and the runtime cannot tell a frozen read from a deliberate one-time value, so no warning is possible at run time; the Vite plugin warns about it at transform time, under the code `template_frozen_read`. Call `.get()` only inside `computed`, `effect`, `resource.params`, and event handlers.

## A component

A component is a function that returns a view. State is signals; the template binds them.

@include packages/zerolith/test/examples/guide.example.browser.test.ts#counter

## Loading it

With no build step, an import map maps the package names to the files, and the application is a module script:

```html
<script type="importmap">
{"imports":{"zerolith":"/vendor/zerolith/index.js","@zerolith/router":"/vendor/router/index.js"}}
</script>
<script type="module" src="/app.js"></script>
```

With a bundler, install the packages and import them; the `development` export condition selects the build with diagnostic text, and the default selects the production build without it.

## Where to go next

- [Application structure](/guide/structure/): the layout every zerolith application uses, what each file owns, and the AGENTS.md that lets an agent work in it.
- [Signals](/guide/signals/): state, derived values, effects, and async values.
- [Templates](/guide/templates/): the `html` tag, bindings, lists, conditions, and what the renderer refuses.
- [Styles](/guide/styles/): scoped component styles with the `css` tag.
- [Routing](/guide/routing/): the typed route table and plain anchors.
- [Forms](/guide/forms/): native forms, enhanced with fetch, pending state, and field errors that share one wire shape with the server.
- [Typed client](/guide/client/): a route table and types generated from an OpenAPI document, checked calls, and problems for failures.
- [Server rendering](/guide/server-rendering/): rendering views to HTML with no DOM.
- [Diagnostics](/guide/diagnostics/): the error record, stable codes, and production builds.
- [Dev tools](/guide/dev-tools/): the in-page inspector, named signals, and Performance tracks.
- [Command line](/guide/command-line/): the dev server for the buildless path, import maps with integrity, and project checks.
- [Vite](/guide/vite/): hot module replacement that swaps components in place and keeps named state.
- [Testing](/guide/testing/): mount with cleanup, settle async work, and check hydration and accessibility in tests.
- [Accessibility](/guide/accessibility/): focus trap, roving tabindex, live announcer, focus origin, hidden text, and preference signals.
- [Custom elements](/guide/elements/): mount a view inside a tree another framework owns, with attributes and properties as signals.
- [Internationalization](/guide/i18n/): locale negotiation and state on Intl, formatters that follow the locale, and compiled MessageFormat 2 catalogs.
- [Observability](/guide/observability/): spans for navigations, hydration, and requests through the OpenTelemetry API.
- [Reference](/reference/zerolith/): every export, generated from the source.
