# @zerolith/router

Typed client-side routing for zerolith.

- `defineRoutes({ name: route({...}) })` is an inference-only route table: parameters come from the path string, data from the loader (write `load` before `view`), and `router.href("release", { tag })` fails to type-check on a misspelled route or a missing parameter.
- Plain anchors navigate. Same-origin links without modifier keys, `download`, `target`, or `rel="external"` are handled by one delegated click listener; everything else is left to the browser.
- A route's `load` runs, and its lazy view resolves, before the URL changes, so the page never shows a half-loaded route; `router.pending` is true meanwhile.
- `head` sets the document title and description per route, statically or from the loaded data.
- `router.ready` settles when the initial navigation has committed, `router.head` is the current route's metadata as a signal, and `renderHead` from `@zerolith/router/server` writes it as `<title>` and `<meta>` elements, so the same router renders a request on the server and hydrates in the browser. `renderRouteState` embeds the loaded data in the page, and the browser router reuses it for the initial navigation instead of running the loader twice.
- Back and forward restore the scroll position; new navigations scroll to the top or to the hash.
- `outlet(router)` renders the current route's view and the fallback for unknown URLs.

The guide is on the [docs site](https://molexxxx.github.io/zerolith/guide/routing/).

Status: alpha. Install with `npm install @zerolith/router@alpha`; the API may change before 1.0.

## License

Apache-2.0. See `LICENSE`.
