---
title: Introduction
description: What zerolith is, how its packages fit together, how to start a project, the one rule to learn first, and a map of the guides.
order: 0
group: Basics
---

# Introduction

zerolith is a standalone frontend framework for single-page applications. State lives in fine-grained signals, HTML templates bind those signals with no compiler, a typed router handles navigation, and one command line serves the app while you work and builds it for production. It talks to any backend over plain HTTP, and renders on the server when a page needs it.

> [!NOTE]
> zerolith 1.0 is out. Every package's API is frozen at 1.0 and supported for 12 months; a breaking change comes only in a major, after the deprecation cycle the [versioning policy](https://github.com/molexxxx/zerolith/blob/main/docs/policy/versioning.md) describes.

The guides explain one concept each, with the pattern zerolith uses for it and an example that runs as a test. New to zerolith? The [tutorial](../learn/index.md) builds a small app from an empty folder, one idea per step, and the [playground](https://zerolith.dev/playground/) runs code in your browser.

## How it fits together

A component is a plain function that builds a view, and it does not run again when its state changes. Its template binds signals to the places on the page that show them, so a change to a signal updates the text, attribute, list, or branch bound to it and nothing else: there is no virtual DOM to compare and no component to render again.

Everything else is a package around that core, and an application installs the ones it uses:

| Package | What it gives an application |
| --- | --- |
| `zerolith` | Signals, the `html` template, `render` and `hydrate`, lists and conditions, scoped styles, JSX, and server rendering from `zerolith/ssr` |
| `@zerolith/router` | A typed route table, plain anchors, loaders, head metadata, and an outlet |
| `@zerolith/forms` | Native forms that work without JavaScript, enhanced with fetch, pending state, and field errors shared with the server |
| `@zerolith/client` | A typed HTTP client generated from an OpenAPI document, with failures read as problems |
| `@zerolith/i18n` | Locale negotiation, cached `Intl` formatters, and MessageFormat 2 catalogs compiled per locale |
| `@zerolith/a11y` | Focus trap, roving tabindex, a live announcer, focus origin, and preference signals |
| `@zerolith/test` | Mounting with cleanup, settling async work, and hydration and accessibility checks |
| `@zerolith/devtools` | The in-page inspector for signals, roots, and diagnostics |
| `@zerolith/otel` | OpenTelemetry spans for navigations, hydration, and requests |
| `@zerolith/vite` | The Vite plugin, for projects that build with Vite |
| `@zerolith/cli` | The `zerolith` command: the starter, the dev server, the build, preview, and project checks |

## Getting started

Node 24 or newer is required. Install the command line once; npm puts the prebuilt binary for your platform on your PATH:

```sh
npm install --global @zerolith/cli
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
| Language | TSX: TypeScript with JSX | `--template ts` for TypeScript with `html` templates, `--template jsx`, or `--template js` for JavaScript with `html` templates |
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

> [!TIP]
> Without a global install, `npx @zerolith/cli new my-app` writes the project. Inside it, `npx zerolith dev` and the `dev`, `build`, and `preview` npm scripts run the project's own copy of the command line, which is what CI should use.

The starter's README walks through its files, deploying, and environment variables, and the [command line guide](command-line.md) has every option.

## A component

A component is a function that returns a view. State is signals, and the template binds them:

@include packages/zerolith/test/examples/guide.example.browser.test.ts#counter

A click sets `count`. The text bound to `count` and `doubled` changes, and the paragraph reads Count: 2, doubled: 4; `Counter` does not run again, and nothing else on the page is touched.

## The one rule to learn first

Bind the signal, not its value. A template given a signal follows it; a template given `count.get()` is given a number, read once:

@include packages/zerolith/test/examples/guide.example.browser.test.ts#frozen

To show a value derived from signals, bind a computed value, as `${computed(() => item.get().name)}`.

> [!IMPORTANT]
> Both forms type-check, and at run time a frozen read looks like a deliberate one-time value, so the runtime cannot warn about it. `zerolith doctor` and the Vite plugin find it in the source and report `template_frozen_read`. Call `.get()` only inside `computed`, `effect`, the params of a `resource`, and event handlers.

## Putting it on the page

`render` mounts a view at the end of an element, named by a CSS selector or passed as the element itself, and returns a root: `container` is the element it mounted into, and `dispose()` removes the view and stops its effects. A selector that matches nothing fails with `mount_target_missing`. `hydrate` takes the same targets for markup the server rendered; see [Server rendering](server-rendering.md).

@include packages/zerolith/test/examples/guide.example.browser.test.ts#mount

The page itself is plain HTML. The starter's `index.html` links the global stylesheet, loads the entry module, `src/main.ts` or `src/main.js`, and leaves one element to mount into; a module script runs once the document is parsed, so it can sit in the head and still find `#app`:

```html
<head>
    <link rel="stylesheet" href="/src/styles.css">
    <script type="module" src="/src/main.ts"></script>
</head>
<body>
    <div id="app"></div>
</body>
```

`zerolith dev` serves the modules as they are and resolves the packages they import from `node_modules`, and `zerolith build` bundles them.

## Where to go next

Read the basics in order; the rest is there for when an application needs it.

### Basics

| Guide | Read it for |
| --- | --- |
| [Application structure](structure.md) | The layout every zerolith application uses, what each file owns, and the `AGENTS.md` that lets an agent work in it |
| [Signals](signals.md) | State, derived values, effects, ownership, and async values |
| [Templates](templates.md) | The `html` tag, components, bindings, lists, conditions, and what the renderer refuses |
| [Styles](styles.md) | Scoped component styles with the `css` tag |

### Building apps

| Guide | Read it for |
| --- | --- |
| [Routing](routing.md) | The route table, page components, loaders, layouts, and plain anchors |
| [Forms](forms.md) | Native forms enhanced with fetch, pending state, and field errors that share one wire shape with the server |
| [Typed client](client.md) | A route table and types generated from an OpenAPI document, checked calls, and problems for failures |
| [Server rendering](server-rendering.md) | Rendering views to HTML with no DOM, and hydrating them in the browser |
| [Custom elements](elements.md) | Mounting a view inside a tree another framework owns, with attributes and properties as signals |
| [Internationalization](i18n.md) | Locale negotiation and state on `Intl`, formatters that follow the locale, and compiled MessageFormat 2 catalogs |
| [Accessibility](accessibility.md) | Focus trap, roving tabindex, live announcer, focus origin, hidden text, and preference signals |

### Tooling

| Guide | Read it for |
| --- | --- |
| [Command line](command-line.md) | The starter, the dev server, the production build, preview, `zerolith.json`, and project checks |
| [Building and serving](deploying.md) | What the build writes and how to serve it from a static host, a web server, or a backend, under a path, and next to a backend while developing |
| [Vite](vite.md) | Hot module replacement that keeps named state, JSX, and templates prepared at build time, for projects on Vite |
| [Testing](testing.md) | Mounting with cleanup, settling async work, and hydration and accessibility checks in tests |
| [Dev tools](dev-tools.md) | The in-page inspector, named signals, and Performance tracks |
| [Diagnostics](diagnostics.md) | The error record, stable codes, and production builds |
| [Observability](observability.md) | Spans for navigations, hydration, and requests through the OpenTelemetry API |
| [Coding agents](agents.md) | What an agent reads in a zerolith app, the project's `AGENTS.md` and the zerolith skill, and how to keep the skill current |

Every export is in the [reference](https://zerolith.dev/reference/zerolith/), generated from the source.
