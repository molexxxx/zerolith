---
title: Introduction
description: What zerolith is, how to start a project, the one rule to learn first, and a map of the guides.
order: 0
group: Basics
---

# Introduction

zerolith is a standalone frontend framework. Fine-grained signals drive HTML templates that need no compiler, a typed router handles navigation, and one command line serves the app while you work and builds it for production. It talks to any backend over plain HTTP.

The guides explain one concept each, with the one pattern zerolith uses for it and an example that runs as a test. New to zerolith? The [tutorial](../learn/index.md) builds a small app from an empty folder, one idea per step, and the [playground](https://molexxxx.github.io/zerolith/playground/) runs the code in your browser.

Status: alpha. Every package is published under the `alpha` dist-tag, and the API may change until it is frozen for 1.0.

## Getting started

Node 24 or newer is required. Install the command line once; npm puts the prebuilt binary for your platform on your PATH:

```sh
npm install --global @zerolith/cli@alpha
```

Then write a starter application and run it:

```sh
zerolith new my-app
cd my-app
zerolith dev
```

`zerolith new` asks a few questions. Enter takes the default, a flag answers a question on the command line, and `--yes` takes every default without asking:

| Choice | Default | Other choices |
| --- | --- | --- |
| Starting point | The starter | `--example fullstack` for an app with its own Node backend |
| Language | TSX | `--template ts`, `--template jsx`, or `--template js` |
| Dev server and build | The zerolith command line | `--vite` for Vite with `@zerolith/vite` |
| Production output | One minified bundle | `--buildless` for the modules behind an import map |
| Inspector | Included | `--no-devtools` |
| Skill for coding agents | Included | `--no-skill` |
| Dependencies | Installed | `--no-install` |

In the project:

| Command | What it does |
| --- | --- |
| `zerolith dev` | Serves the app at http://127.0.0.1:8080/ and reloads it as you edit |
| `zerolith build` | Bundles and minifies it into `dist/`, static files for any host or backend |
| `zerolith preview` | Serves `dist/` the way a host will, to check the build |

The starter's README walks through its files, deploying, and environment variables, and the [command line guide](command-line.md) has every option.

## The one rule to learn first

Bind the signal, not its value.

```ts
html`<p>${count}</p>`;                              // live: follows count
html`<p>${computed(() => item.get().name)}</p>`;    // live: a derived value
html`<p>${count.get()}</p>`;                        // frozen: read once, never updates
```

Both forms type-check, and the runtime cannot tell a frozen read from a deliberate one-time value, so no warning is possible at run time; `zerolith doctor` and the Vite plugin report it before the code runs, under the code `template_frozen_read`. Call `.get()` only inside `computed`, `effect`, `resource.params`, and event handlers.

## A component

A component is a function that returns a view. State is signals; the template binds them.

@include packages/zerolith/test/examples/guide.example.browser.test.ts#counter

A click sets `count`, and only the two text nodes bound to `count` and `doubled` change: the paragraph reads Count: 2, doubled: 4. Nothing re-renders.

## Putting it on the page

`render` mounts a view at the end of an element, named by a CSS selector or passed as the element itself, and returns a root: `container` is the element it mounted into, and `dispose()` removes the view and stops its effects. A selector that matches nothing fails with [`mount_target_missing`](https://molexxxx.github.io/zerolith/e/mount_target_missing/). `hydrate` takes the same targets for markup the server rendered; see [Server rendering](server-rendering.md).

@include packages/zerolith/test/examples/guide.example.browser.test.ts#mount

The page itself is plain HTML with one element to mount into and one module script; `zerolith dev` resolves the packages the module imports from `node_modules`, and `zerolith build` bundles them.

```html
<main id="app"></main>
<script type="module" src="/src/main.ts"></script>
```

## Where to go next

- [Application structure](structure.md): the layout every zerolith application uses, what each file owns, and the AGENTS.md that lets an agent work in it.
- [Signals](signals.md): state, derived values, effects, and async values.
- [Templates](templates.md): the `html` tag, bindings, lists, conditions, and what the renderer refuses.
- [Styles](styles.md): scoped component styles with the `css` tag.
- [Routing](routing.md): the typed route table and plain anchors.
- [Forms](forms.md): native forms, enhanced with fetch, pending state, and field errors that share one wire shape with the server.
- [Typed client](client.md): a route table and types generated from an OpenAPI document, checked calls, and problems for failures.
- [Server rendering](server-rendering.md): rendering views to HTML with no DOM.
- [Diagnostics](diagnostics.md): the error record, stable codes, and production builds.
- [Dev tools](dev-tools.md): the in-page inspector, named signals, and Performance tracks.
- [Command line](command-line.md): the starter, the dev server, the production build, preview, `zerolith.json`, and project checks.
- [Building and serving](deploying.md): what the build writes and how to serve it from a static host, a web server, or a backend, under a path, and next to a backend while developing.
- [Vite](vite.md): for projects already on Vite, hot module replacement that keeps named state, JSX, and templates prepared at build time.
- [Testing](testing.md): mount with cleanup, settle async work, and check hydration and accessibility in tests.
- [Accessibility](accessibility.md): focus trap, roving tabindex, live announcer, focus origin, hidden text, and preference signals.
- [Custom elements](elements.md): mount a view inside a tree another framework owns, with attributes and properties as signals.
- [Internationalization](i18n.md): locale negotiation and state on Intl, formatters that follow the locale, and compiled MessageFormat 2 catalogs.
- [Observability](observability.md): spans for navigations, hydration, and requests through the OpenTelemetry API.
- [Coding agents](agents.md): what an agent reads in a zerolith app, the project's AGENTS.md and the zerolith skill, and how to keep the skill current.
- [Reference](https://molexxxx.github.io/zerolith/reference/zerolith/): every export, generated from the source.
