<!-- Generated from docs/guide/dev-tools.md by npm run skills. Edit the guide, then regenerate. -->

# Dev tools

zerolith's development tools live in the page, not in a browser extension: an inspector that docks at the bottom of the page, a hook any tool can read, and timings in the browser's Performance panel. All three exist only in development builds; a production build ships none of them and records nothing.

## The inspector

The inspector is a plain ES module, so it works wherever the application is served: `zerolith dev`, Vite, a static server, electron-vite, or `file://`. Mount it once, as the starter's `main.ts` does; in a production build the call does nothing, since the package's production entry is an empty stand-in.

```ts
import { mountDevtools } from "@zerolith/devtools";

mountDevtools();
```

Press `Alt+Shift+Z` or the launcher, the tab at the right edge of the window, to open the dock. The tab shows a sliver until the pointer or the keyboard reaches it, so it does not cover the page. It has three tabs:

| Tab | Shows |
| --- | --- |
| Signals | Every signal, computed value, and effect, with its kind, its name, how many nodes depend on it, and its current value |
| Roots | Every mounted root, whether `render` or `hydrate` created it, and the element it lives in |
| Diagnostics | Every warning and error reported so far, with its severity, its cause, its arguments, and a link to its code's page |

`mountDevtools({ open: true })` starts with the dock open, and the handle it returns has `toggle(open)` and `dispose()`. Everything the inspector creates for itself is marked internal and left out of its own tables.

> [!TIP]
> Give state a name with the `name` option so the Signals tab reads well. The name also keeps the value across an edit under `zerolith dev` and the Vite plugin.
>
> ```ts
> const count = signal(0, { name: "count" });
> const doubled = computed(() => count.get() * 2, { name: "doubled" });
> ```

> [!IMPORTANT]
> The inspector reads the core through the `zerolith/internal` entry, which can change with every version, so it requires the `zerolith` it was released with. It declares that exact version as a peer dependency, and `mountDevtools` stops with `package_version_mismatch` when it meets another.

## The hook

Development builds publish `globalThis.__ZEROLITH_DEVTOOLS__`, a small object the inspector reads. It is one consumer: a browser extension, a test, or an agent's MCP server can read the same hook.

| Member | Returns |
| --- | --- |
| `version` | The version of the hook's shape |
| `nodes()` | The live reactive nodes, oldest first: each with its `id`, its `kind` (`state`, `computed`, or `effect`), its `name`, its `value`, and how many `observers` depend on it |
| `roots()` | The mounted roots, each with its `id`, its `kind` (`render` or `hydrate`), and its `container` |
| `diagnostics()` | The most recent diagnostics, oldest first |
| `subscribe(listener)` | An unsubscribe function; the listener receives each change as it happens |

A subscriber hears four kinds of event: `node` when a reactive node is created, `root` when a root mounts or is removed, `diagnostic` with each new record, and `flush` with the number of effects that ran after a change.

## Performance panel

In development, the runtime times its work as entries in Chrome's Performance panel, through `performance.measure` with the DevTools extensibility payload, so framework work is visible next to layout and paint without any extension. The entries sit in a `zerolith` group:

| Track | Entries |
| --- | --- |
| `Render` | `zerolith:render` and `zerolith:hydrate`, one per root |
| `Signals` | `zerolith:effect`, one per effect run |

Each entry is cleared from the page's performance buffer as soon as it is recorded, so `performance.getEntriesByType("measure")` lists none of them and a long session does not accumulate them; the Performance panel keeps every one it recorded.
