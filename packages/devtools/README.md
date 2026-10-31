# @zerolith/devtools

An in-page inspector for zerolith applications. It is a plain ES module, so it works wherever the app is served: Vite, a static server, electron-vite, or `file://`.

```ts
import { mountDevtools } from "@zerolith/devtools";

mountDevtools();
```

The dock shows the live reactive graph (every signal, computed value, and effect, with names from the `name` option and current values), the mounted roots, and the diagnostics feed. Press `Alt+Shift+Z` to toggle it.

The package reads the hook the core publishes in development builds as `globalThis.__ZEROLITH_DEVTOOLS__`. Under the `development` export condition it is the inspector; otherwise it is a no-op, so the call can stay in application code.

The guide is on the [docs site](https://molexxxx.github.io/zerolith/guide/dev-tools/).

Status: alpha. Install with `npm install @zerolith/devtools@alpha`; the API may change before 1.0.

## Documentation

- The [dev tools guide](https://molexxxx.github.io/zerolith/guide/dev-tools/) explains it with examples that run as tests.
- The [reference](https://molexxxx.github.io/zerolith/reference/zerolith-devtools/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://molexxxx.github.io/zerolith/learn/) builds an app step by step, and the [playground](https://molexxxx.github.io/zerolith/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
