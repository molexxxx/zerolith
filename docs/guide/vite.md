---
title: Vite
description: The Vite plugin: hot module replacement that swaps components in place and keeps named signal state, and the parts of a build it leaves alone.
order: 12
---

# Vite

zerolith runs under Vite without a plugin. The packages are plain ES modules, and Vite's default `development` condition selects the build with diagnostic text and the inspector while developing and the lean build for production. What the plugin adds is hot module replacement that understands components, so an edit lands in the page without a reload and without losing the state you were looking at.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { zerolith } from "@zerolith/vite";

export default defineConfig({
    plugins: [zerolith()]
});
```

## What an edit does

Vite can only apply an update in place when some module on the way to the entry accepts it; otherwise it reloads the page. The plugin makes every module that exports a component or mounts a root accept its own updates, and keeps the rest of the page consistent in three steps.

1. Every exported function whose name starts with a capital letter is treated as a component. The export becomes a proxy that forwards to the latest version of the function, so modules that imported it, and are not re-executed, keep calling current code.
2. Calls to `render` and `hydrate` imported from `zerolith` are recorded together with the expression they rendered, so each root can be rendered again.
3. When a module changes, the values of all named signals are saved just before Vite replaces it. The new version runs, its components re-register, every recorded root renders again, and the saved values flow into the signals created during that render that carry the same names. Whatever nothing claimed is dropped.

A component module goes in like this:

@include packages/vite/test/examples/vite.example.test.ts#before

and comes out like this in development:

@include packages/vite/test/examples/vite.example.test.ts#after

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

For `vite build`, the plugin runs the template prepare pass of ADR 0005 ahead of every other transform. Each `html` literal is scanned at build time with the same scanner the runtime uses, and the module registers the markup and the part table next to the literal through `prepared`, so the browser parses the static markup once and binds the template without scanning it; a template the scanner refuses is a build error at the literal instead of an exception in the browser. The scanner then leaves the bundle: the core's scanner module is replaced by one that reports `template_not_prepared`, which a template the build never saw would hit, so `html` must reach the pass as a tag. A module that declares or passes `html` around as a value, or a library that bundles its own copy of it, fails the build at that line; pass `prepare: false` to keep the scanner and leave the literals alone.

The output is then checked: a module of the development build of the core, anything under `zerolith/dist/` that is not under `production/`, that reaches a build in production mode fails the build with the module that leaked, because it means the `production` export condition did not apply, through a `resolve.conditions` override or an alias. The size of this repository's tasks example, built for production, is measured in CI next to the core's budget, so the built path is held to a number the same way the runtime is.

## JSX

Ahead of every other transform, the plugin lowers each JSX expression in a `.jsx` or `.tsx` file to the `html` call it stands for, following RFC 0001: elements become template markup, the `prop:`, `on:`, and `bool:` namespaces become the other binding forms, and capitalized tags become component calls with a `children` prop. The lowered module keeps its line count, and nothing from JSX reaches the browser; `zerolith/jsx-runtime` exists for the types a `tsconfig` with `"jsxImportSource": "zerolith"` reads, and throws a `jsx_not_lowered` diagnostic if it is ever called. Pass `jsx: false` to leave JSX files to Vite's own transform. The [templates guide](/guide/templates/) shows the same component in both spellings.

## Development warnings

The runtime cannot tell a frozen read from a deliberate one, and it does not read markup for meaning, so the plugin does both at transform time and warns in the terminal, with the file and position and a link to the diagnostic's page:

- `template_frozen_read`: a `.get()` read is bound in a template, which the rule on the first page of this guide calls out as the mistake nothing else can catch. Bind the signal, or `computed(() => ...)`.
- `image_without_alt`, `button_without_name`, `frame_without_title`: the accessibility defects visible in the template's static markup, the same codes `@zerolith/test` reports at run time.

They are warnings, not errors, because a template may read a value once on purpose. Pass `lint: false` to turn them off.
