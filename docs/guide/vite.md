---
title: Vite
description: "For projects that use Vite: the plugin brings zerolith's build passes into Vite and adds hot module replacement that swaps components in place and keeps named signal state."
order: 14
group: Tooling
---

# Vite

[Vite](https://vite.dev) is a separate tool from the wider JavaScript ecosystem, run with Node, that does two jobs for a web project: a development server that serves the source files to the browser while you work and updates the page as you edit, and a production build that bundles and minifies them. Many frameworks are built on it. A zerolith project does not need it: `zerolith dev` and `zerolith build` in the [command line](command-line.md) do both jobs, and the build runs Rolldown, the bundler Vite itself uses. This guide is for a project that already uses Vite, or that wants a Vite plugin such as Tailwind's: the zerolith plugin brings the same JSX lowering, template preparation, and build checks into Vite, and adds hot replacement that swaps components in place.

zerolith runs under Vite without a plugin. The packages are plain ES modules, and Vite's default `development` condition selects the build with diagnostic text and the inspector while developing and the lean build for production. What the plugin adds is hot module replacement that understands components, so an edit lands in the page without a reload and without losing the state you were looking at.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { zerolith } from "@zerolith/vite";

export default defineConfig({
    plugins: [zerolith()]
});
```

The plugin and `zerolith` are released together and share the `zerolith/internal` entry, so install them at one version. The plugin declares that exact version of `zerolith` as a peer dependency, so npm refuses an installation that mixes versions, and it stops with [`package_version_mismatch`](https://molexxxx.github.io/zerolith/e/package_version_mismatch/) if it meets another anyway.

## What an edit does

Vite can only apply an update in place when some module on the way to the entry accepts it; otherwise it reloads the page. The plugin makes every module that exports a component or mounts a root accept its own updates, and keeps the rest of the page consistent in three steps.

1. Every exported function whose name starts with a capital letter is treated as a component. The export becomes a proxy that forwards to the latest version of the function, so modules that imported it, and are not re-executed, keep calling current code.
2. Calls to `render` and `hydrate` imported from `zerolith` are recorded together with the expression they rendered, so each root can be rendered again.
3. When a module changes, the values of all named signals are saved just before Vite replaces it. The new version runs, its components re-register, every recorded root renders again, and the saved values flow into the signals created during that render that carry the same names. Whatever nothing claimed is dropped.

A component module goes in like this:

@include packages/vite/test/examples/vite.example.test.ts#before excerpt js

and comes out like this in development:

@include packages/vite/test/examples/vite.example.test.ts#after excerpt js

The function declaration keeps its hoisting because the registration runs first and the renamed function is already defined, and no line moves, so stack traces still point at the file you wrote.

## What survives an edit

- Named signals, wherever they live: `signal(0, { name: "draft" })` at module level or inside a component keeps its value through the re-render, the same way it survives a reload under `zerolith dev`.
- Module-level state in modules that did not change and are not between the changed module and the one that accepted the update. Vite re-executes only the chain from the edited module up to the accepting one.
- The scroll position, open dev tools, and everything else a reload would discard.

Unnamed signals in a component are created again when the root re-renders, and unnamed module-level signals in an edited module start over. Give state a name when you want it to outlive an edit; the name also labels it in the inspector.

## What the plugin leaves alone

- Production builds. The development rewrite applies only to the dev server; `vite build` gets the prepare pass and the output check described below.
- Server-side transforms, classes, lowercase functions, anonymous default exports, and `render` reached through anything other than the binding imported from `zerolith`. An aliased import such as `import { render as mount }` is followed; a `render` stored in a variable first is not.
- Modules under `node_modules`. Pass `include` and `exclude` regular expressions to change which ids are rewritten; both are tested against the id with path separators normalized to `/`.

The plugin also keeps `zerolith`, `@zerolith/router`, `@zerolith/devtools`, and its own runtime out of Vite's dependency pre-bundling, so the application and the plugin's runtime share one copy of the framework and the inspector sees every signal.

## Compared with the buildless dev server

`zerolith dev` has no module graph to patch, so it reloads the page on any change and restores named signals afterwards. The plugin does the same restore without the reload. Both read the same `name` option, so an application moves between the two without changing how it keeps state.

## In a production build

For `vite build`, the plugin runs the template prepare pass ahead of every other transform. Each `html` literal is scanned at build time with the same scanner the runtime uses, and the module registers the markup and the part table next to the literal through `prepared`, so the browser parses the static markup once and binds the template without scanning it; a template the scanner refuses is a build error at the literal instead of an exception in the browser. A template with no bindings goes one step further: its view is created once at module scope, and every render reuses it instead of allocating a new one. The scanner then leaves the bundle: the core's scanner module is replaced by one that reports `template_not_prepared`, which a template the build never saw would hit, so `html` must reach the pass as a tag. A module that declares or passes `html` around as a value, or re-exports it from zerolith, fails the build at that line, because a template tagged through it would reach the browser unprepared; import `html` from zerolith in each module that uses it, and import it statically, since a template tagged by `html` from a dynamic `import("zerolith")` is never seen by the pass and reports `template_not_prepared` when it renders. Pass `prepare: false` to keep the scanner and leave the literals alone.

The output is then checked: a module of the development build of the core, anything under `zerolith/dist/` that is not under `production/`, that reaches a build in production mode fails the build with the module that leaked, because it means the `production` export condition did not apply, through a `resolve.conditions` override or an alias. The size of this repository's tasks example, built for production, is measured in CI next to the core's budget, so the built path is held to a number the same way the runtime is.

Every client build also keeps lazy modules apart. A view declared with `lazy()` from `@zerolith/router`, and a locale module of a message index compiled by `zerolith-i18n`, are meant to load as chunks of their own; when another module imports one of them statically as well, the bundler puts it in the importing chunk, so the build fails with [`lazy_module_not_split`](https://molexxxx.github.io/zerolith/e/lazy_module_not_split/), naming the module and every static importer. A type-only import, `import type`, is erased before bundling and does not count. Server builds are not checked, since a server bundle has no chunks to keep apart.

## JSX

Ahead of every other transform, the plugin lowers each JSX expression in a `.jsx` or `.tsx` file to the `html` call it stands for: elements become template markup, the `prop:`, `on:`, and `bool:` namespaces become the other binding forms, and capitalized tags become component calls with a `children` prop. The lowered module keeps its line count, and nothing from JSX reaches the browser; `zerolith/jsx-runtime` exists for the types a `tsconfig` with `"jsxImportSource": "zerolith"` reads, and throws a `jsx_not_lowered` diagnostic if it is ever called. Pass `jsx: false` to leave JSX files to Vite's own transform. The [templates guide](templates.md) shows the same component in both spellings.

## Development warnings

The runtime cannot tell a frozen read from a deliberate one, and it does not read markup for meaning, so the plugin does both at transform time and warns in the terminal, with the file and position and a link to the diagnostic's page:

- `template_frozen_read`: a `.get()` read is bound in a template, which the rule on the first page of this guide calls out as the mistake nothing else can catch. Bind the signal, or `computed(() => ...)`.
- `image_without_alt`, `button_without_name`, `frame_without_title`: the accessibility defects visible in the template's static markup, the same codes `@zerolith/test` reports at run time.

A project without Vite gets the same warnings from `zerolith doctor`, which runs the same checks over its sources; see [Command line](command-line.md).

They are warnings, not errors, because a template may read a value once on purpose. Pass `lint: false` to turn them off.
