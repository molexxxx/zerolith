# @zerolith/devtools

An in-page inspector for zerolith applications. It is a plain ES module, so it works wherever the app is served: Vite, a static server, electron-vite, or `file://`.

```ts
import { mountDevtools } from "@zerolith/devtools";

mountDevtools();
```

The dock shows the live reactive graph (every signal, computed value, and effect, with names from the `name` option and current values), the mounted roots, and the diagnostics feed. Press `Alt+Shift+Z` to toggle it.

The package reads the hook the core publishes in development builds as `globalThis.__ZEROLITH_DEVTOOLS__`. Under the `development` export condition it is the inspector; otherwise it is a no-op, so the call can stay in application code.

Status: pre-alpha, nothing published.

## License

Apache-2.0. See `LICENSE`.
