---
title: Dev tools
description: The in-page inspector, the development hook it reads, named signals, and Performance panel tracks, all independent of how the app is served.
order: 16
group: Tooling
---

# Dev tools

The inspector is a plain ES module, so it works wherever the application is served: Vite, a static server, electron-vite, or `file://`. Mount it once; in production builds the call is a no-op.

```ts
import { mountDevtools } from "@zerolith/devtools";

mountDevtools();
```

The inspector reads the core through the `zerolith/internal` entry, which can change with every version, so it requires the `zerolith` it was released with: it declares that exact version as a peer dependency, and `mountDevtools` stops with [`package_version_mismatch`](/e/package_version_mismatch/) when it meets another.

Press `Alt+Shift+Z` or the launcher button to open the dock. It shows every signal, computed value, and effect with its current value and the number of nodes that depend on it, the mounted roots, and the diagnostics feed with links to each code's page. Give state a label with the `name` option so the table reads well:

```ts
const count = signal(0, { name: "count" });
const doubled = computed(() => count.get() * 2, { name: "doubled" });
```

## The hook

Development builds publish `globalThis.__ZEROLITH_DEVTOOLS__`, a small object with `nodes()`, `roots()`, `diagnostics()`, and `subscribe()`. The inspector is one consumer; a browser extension, a test, or an agent's MCP server can read the same hook. Production builds publish nothing and record nothing.

## Performance panel

In development the runtime times renders, hydrations, and effect runs as entries on `Render` and `Signals` tracks in Chrome's Performance panel (through `performance.measure` with the DevTools extensibility payload), so framework work is visible next to layout and paint without any extension.
