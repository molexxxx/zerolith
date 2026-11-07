# @zerolith/router

Typed client-side routing for zerolith.

- `defineRoutes({ name: route({...}) })` is an inference-only route table: parameters come from the path string, data from the loader (write `load` before `view`), and `router.href("release", { tag })` fails to type-check on a misspelled route or a missing parameter.
- Plain anchors navigate. Same-origin links without modifier keys, `download`, `target`, or `rel="external"` are handled by one delegated click listener; everything else is left to the browser.
- A route's `load` runs, and its lazy view resolves, before the URL changes, so the page never shows a half-loaded route; `router.pending` is true meanwhile.
- `head` sets the document title and description per route, statically or from the loaded data.
- `router.ready` settles when the initial navigation has committed, `router.head` is the current route's metadata as a signal, and `renderHead` from `@zerolith/router/server` writes it as `<title>` and `<meta>` elements, so the same router renders a request on the server and hydrates in the browser. `renderRouteState` embeds the loaded data in the page, and the browser router reuses it for the initial navigation instead of running the loader twice.
- `base`, such as `import.meta.env.BASE_URL`, serves the application under a path: route paths stay relative to it, `href()` includes it, and links outside it are left to the browser.
- Back and forward restore the scroll position; new navigations scroll to the top or to the hash.
- `focus`, such as `"h1"`, moves keyboard focus to the new page after a navigation, so keyboard and screen reader users stay with it, without moving the scroll.
- `navigate(url, { shallow: true })` changes the query without building the page again, for state the page keeps in the URL, such as a search; `failed` renders in place of a page whose view throws.
- The table can be given as a function, `createRouter(() => routes)`, for a table whose components import the router back, so the modules load in any order.
- `router.outlet()` renders the current route's view, and the fallback for unknown URLs, for the layout to place.

The guide is on the [docs site](https://zerolith.dev/guide/routing/).

Install with `npm install @zerolith/router`. The API is frozen at 1.0: a breaking change comes only in a major, after a deprecation notice, and the [support policy](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md) says how long a line gets fixes.

## Documentation

- The [routing guide](https://zerolith.dev/guide/routing/) explains it with examples that run as tests.
- The [reference](https://zerolith.dev/reference/zerolith-router/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://zerolith.dev/learn/) builds an app step by step, and the [playground](https://zerolith.dev/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
