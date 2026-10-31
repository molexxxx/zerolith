# @zerolith/router

Typed client-side routing for zerolith.

- `defineRoutes({ name: route({...}) })` is an inference-only route table: parameters come from the path string, data from the loader (write `load` before `view`), and `router.href("release", { tag })` fails to type-check on a misspelled route or a missing parameter.
- Plain anchors navigate. Same-origin links without modifier keys, `download`, `target`, or `rel="external"` are handled by one delegated click listener; everything else is left to the browser.
- A route's `load` runs, and its lazy view resolves, before the URL changes, so the page never shows a half-loaded route; `router.pending` is true meanwhile.
- `head` sets the document title and description per route, statically or from the loaded data.
- `router.ready` settles when the initial navigation has committed, `router.head` is the current route's metadata as a signal, and `renderHead` from `@zerolith/router/server` writes it as `<title>` and `<meta>` elements, so the same router renders a request on the server and hydrates in the browser. `renderRouteState` embeds the loaded data in the page, and the browser router reuses it for the initial navigation instead of running the loader twice.
- `base`, such as `import.meta.env.BASE_URL`, serves the application under a path: route paths stay relative to it, `href()` includes it, and links outside it are left to the browser.
- Back and forward restore the scroll position; new navigations scroll to the top or to the hash.
- `outlet(router)` renders the current route's view and the fallback for unknown URLs.

The guide is on the [docs site](https://molexxxx.github.io/zerolith/guide/routing/).

Status: alpha. Install with `npm install @zerolith/router@alpha`; the API may change before 1.0.

## Documentation

- The [routing guide](https://molexxxx.github.io/zerolith/guide/routing/) explains it with examples that run as tests.
- The [reference](https://molexxxx.github.io/zerolith/reference/zerolith-router/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://molexxxx.github.io/zerolith/learn/) builds an app step by step, and the [playground](https://molexxxx.github.io/zerolith/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
