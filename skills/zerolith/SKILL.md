---
name: zerolith
description: Builds, changes, and reviews web applications made with zerolith, the frontend framework with fine-grained signals, html templates, a typed router, native forms, server rendering, and the zerolith command line. Use when a project depends on zerolith or @zerolith/* packages or has a zerolith.json, or when the user asks for zerolith components, pages, routes, state, forms, tests, or builds.
license: Apache-2.0
---

# zerolith

zerolith is a standalone frontend framework. A component is a function that runs once and returns an `html` template; signals hold state; bindings keep the DOM current with no re-rendering and no virtual DOM. Every concept has exactly one pattern, listed below. Use it, and never introduce a second way to do the same thing.

## Before changing code

1. Read the project's `AGENTS.md`. It names the commands and where things go, and it wins over this file where they differ.
2. Check the installed `zerolith` version in `package.json`. The API may change between alpha versions, and the references describe the repository's main branch, which can be ahead of the latest release. When a reference shows something the installed version lacks, the changelog at https://github.com/molexxxx/zerolith/blob/main/CHANGELOG.md says which release brings it.
3. Know the layout: pages are components in `src/components/` with a route in `src/routes.ts`; shared state is in `src/store.ts`; the router is in `src/router.ts`; files served as they are go in `public/`. `src/api.ts` and `src/messages/` are generated: change their inputs and regenerate, never edit them.

## Rules

1. **Bind the signal, not its value.** `${count}` stays live; `${count.get()}` reads once and the page never updates. Call `.get()` only inside `computed`, `effect`, a `resource`'s `params`, and event handlers. `zerolith doctor` reports a frozen read as `template_frozen_read`.
2. **A component runs once.** It is a capitalized function returning a view, called when its part of the page is created and never again. Create signals and computed values at its top; derive changing values with `computed` instead of expecting a re-run.
3. **Change state with `set()` and a new value.** `set` ignores a value equal to the current one under `Object.is`, so mutating an array or object in place changes nothing on the page. Build a new array or object and set it.
4. **Derive, do not sync.** A value that follows other state is a `computed`. Never keep two signals in step with an `effect`.
5. **Effects are for the outside world**: storage, timers, logging, focus, subscriptions. What the page shows comes from bindings, never from an effect writing to the DOM.
6. **Shared state lives in `src/store.ts`**; state one component needs stays inside it. Name state that should survive a dev reload: `signal(value, { name: "items" })`.
7. **Never pass user input to `unsafeHtml`.** Values in templates are always text; markup in a string is never parsed.

## One pattern per concept

| Need | Pattern |
| --- | --- |
| Text that follows state | `${signal}` or `${computed(() => ...)}` |
| An attribute | `name=${value}`; `null` or `undefined` removes it, `false` becomes the text `"false"` |
| A boolean attribute | `?disabled=${flag}` |
| A property | `.value=${value}`, `.checked=${flag}` |
| An event | `@click=${handler}` |
| An element | `ref=${writableSignal}` or `ref=${callback}` |
| A list that changes | `each(items, (item) => item.id, (item) => Row({ item }))`; the row receives the item as a signal |
| A list that never changes | `entries.map((entry) => html\`...\`)` |
| A condition | `when(condition, () => view, () => otherwise)` |
| Component styles | `` const styles = css`:scope { ... }` ``, applied with `class=${styles}` |
| Async data | `resource({ params, loader })`, read through `get()`, `status`, `error`, and `reload()` |
| Mounting | `render(view, "#app")`; `hydrate(view, "#app")` adopts server-rendered markup |
| A page | a route in `src/routes.ts` and a component; links are anchors with `router.href("name", params)` |
| A form that posts | `@zerolith/forms`: native forms with fetch, pending state, and field errors as RFC 9457 problems |
| A typed backend call | `@zerolith/client`, generated from an OpenAPI document with `zerolith-client` |
| Messages and formatting | `@zerolith/i18n` |
| Focus trap, roving tabindex, announcements | `@zerolith/a11y` |
| A view inside another framework | a custom element with `define` from `zerolith/element` |
| Tests | `mount`, `cleanup`, `settle`, and `accessibilityIssues` from `@zerolith/test` |

## JSX projects

In `.tsx` and `.jsx` files the same templates are spelled as JSX, lowered to the same `html` calls by `zerolith dev`, `zerolith build`, and `@zerolith/vite`. Write `class`, not `className`; `on:click={handler}` for events; `prop:value={signal}` for properties; `bool:disabled={flag}` for boolean attributes. Lists and conditions are still `each` and `when`, called as functions; there is no `<For>` or `<Show>`. The rule about binding the signal holds unchanged.

## What the renderer refuses

Each of these fails with a coded error before anything reaches the DOM: a `<script>` element in a template; a binding inside a comment, a tag name, an attribute name, or the text of `<style>`, `<textarea>`, or `<title>` (bind `.textContent` or `.value` instead); `.innerHTML`, `.outerHTML`, `srcdoc`, and `on*` attribute bindings; a function or plain object as content, which is usually a component passed instead of called. `javascript:` URLs in `href`, `src`, and similar attributes are removed.

## Diagnostics

Every error and warning carries a stable code and a page at `https://molexxxx.github.io/zerolith/e/<code>/` with the cause and the fix. When a code appears, read its entry in [references/diagnostic-codes.md](references/diagnostic-codes.md) and apply the fix it names. Never suppress a diagnostic or work around it.

## Commands

| Command | Use |
| --- | --- |
| `npm run dev` | Serve with live reload; named signals keep their values across edits |
| `npm run check` | The project's gate, where the starter defines it: typecheck, lint, browser tests, and the build |
| `npm test` | Browser tests with Vitest |
| `npx zerolith doctor` | Check the page, the import map, and template mistakes before running anything |
| `npm run build` | Bundle and minify into `dist/` |
| `npm run preview` | Serve `dist/` as a static host would |

## Finishing a change

1. `npx zerolith doctor` reports no errors.
2. A test covers the behavior you changed: mount the view, act on it, check the result, and keep `accessibilityIssues(container)` empty.
3. Typecheck, lint, tests, and the build pass (`npm run check` where it exists).
4. Interactive elements are native (`button`, `a`, `input`, `form`) and have accessible names.

## References

Read only the reference the task needs. Each is a guide from the docs, with tested examples.

- [references/introduction.md](references/introduction.md): getting started and the first rule.
- [references/structure.md](references/structure.md): the project layout and what each file owns.
- [references/signals.md](references/signals.md): signals, computed values, effects, batching, ownership, resources.
- [references/templates.md](references/templates.md): bindings, lists, conditions, JSX, raw markup, refusals.
- [references/styles.md](references/styles.md): scoped styles with `css`.
- [references/routing.md](references/routing.md): the route table, links, loaders, head, base paths.
- [references/forms.md](references/forms.md): enhanced native forms and field errors.
- [references/client.md](references/client.md): the typed client generated from OpenAPI.
- [references/server-rendering.md](references/server-rendering.md): rendering to HTML and hydration.
- [references/elements.md](references/elements.md): custom elements for use inside other frameworks.
- [references/i18n.md](references/i18n.md): locales, formatters, and compiled messages.
- [references/accessibility.md](references/accessibility.md): focus, announcements, and preference signals.
- [references/testing.md](references/testing.md): mounting, settling, hydration and accessibility checks.
- [references/command-line.md](references/command-line.md): `new`, `dev`, `build`, `preview`, `importmap`, `doctor`, `zerolith.json`.
- [references/deploying.md](references/deploying.md): serving a build, base paths, caching, a backend's proxy.
- [references/vite.md](references/vite.md): projects on Vite.
- [references/dev-tools.md](references/dev-tools.md): the in-page inspector and Performance tracks.
- [references/diagnostics.md](references/diagnostics.md): the diagnostic record and production builds.
- [references/observability.md](references/observability.md): OpenTelemetry spans.
- [references/agents.md](references/agents.md): how an agent is set up for a zerolith app, and what the docs and diagnostics give it.
- [references/diagnostic-codes.md](references/diagnostic-codes.md): every code with its cause and fix.
