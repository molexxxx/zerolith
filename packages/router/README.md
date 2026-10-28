# @zerolith/router

Typed client-side routing for zerolith.

- `defineRoutes({ name: route({...}) })` is an inference-only route table: parameters come from the path string, data from the loader (write `load` before `view`), and `router.href("release", { tag })` fails to type-check on a misspelled route or a missing parameter.
- Plain anchors navigate. Same-origin links without modifier keys, `download`, `target`, or `rel="external"` are handled by one delegated click listener; everything else is left to the browser.
- A route's `load` runs, and its lazy view resolves, before the URL changes, so the page never shows a half-loaded route; `router.pending` is true meanwhile.
- `head` sets the document title and description per route, statically or from the loaded data.
- Back and forward restore the scroll position; new navigations scroll to the top or to the hash.
- `outlet(router)` renders the current route's view and the fallback for unknown URLs.

Status: pre-alpha, nothing published.

## License

Apache-2.0. See `LICENSE`.
