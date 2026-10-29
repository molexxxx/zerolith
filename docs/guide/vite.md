---
title: Vite
description: The Vite plugin: hot module replacement that swaps components in place and keeps named signal state, and the parts of a build it leaves alone.
order: 11
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

- Production builds. The plugin applies only to the dev server (`apply: "serve"`), so `vite build` emits the same output with or without it.
- Server-side transforms, classes, lowercase functions, anonymous default exports, and `render` reached through anything other than the binding imported from `zerolith`. An aliased import such as `import { render as mount }` is followed; a `render` stored in a variable first is not.
- Modules under `node_modules`. Pass `include` and `exclude` regular expressions to change which ids are rewritten; both are tested against the id with path separators normalized to `/`.

The plugin also keeps `zerolith`, `@zerolith/router`, `@zerolith/devtools`, and its own runtime out of Vite's dependency pre-bundling, so the application and the plugin's runtime share one copy of the framework and the inspector sees every signal.

## Compared with the buildless dev server

`zerolith dev` has no module graph to patch, so it reloads the page on any change and restores named signals afterwards. The plugin does the same restore without the reload. Both read the same `name` option, so an application moves between the two without changing how it keeps state.
