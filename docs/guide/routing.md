---
title: Routing
description: The typed route table, plain anchors, loaders, head metadata, and the outlet.
order: 5
group: Building apps
---

# Routing

`@zerolith/router` is a client-side router. The route table is inference-only: parameters come from each path string, and `router.href("release", { tag })` fails to type-check on a misspelled route or a missing parameter.

## The route table

@include packages/router/test/examples/routing.example.browser.test.ts#table

Write `load` before `view` so the loader's result type flows into the view. A route's `load` and lazy view resolve before the URL changes; `router.pending` is true meanwhile, and a navigation that is superseded by a newer one is discarded. A view declared with `lazy()` loads as a chunk of its own, and with `@zerolith/vite` a build that also imports it statically fails with [`lazy_module_not_split`](/e/lazy_module_not_split/) instead of quietly bundling it into the page.

## Links and navigation

Plain anchors navigate. One delegated listener handles same-origin links clicked without modifier keys and leaves `download`, `target`, and `rel="external"` links, and any link with a modifier key, to the browser.

@include packages/router/test/examples/routing.example.browser.test.ts#navigate

Back and forward restore the scroll position; a new navigation scrolls to the top or to the hash. Pass `scroll: false` to keep control of scrolling.

## Under a base path

An application served under a path, such as `/app/`, passes it as `base`; `import.meta.env.BASE_URL` carries the base `zerolith dev`, `zerolith build`, and Vite were given, so one line follows all of them:

```ts
const router = createRouter(routes, { base: import.meta.env.BASE_URL });
```

Route paths stay relative to the base: `"/notes/:id"` matches `/app/notes/7`, and `href("note", { id: "7" })` returns `/app/notes/7`. `navigate` and `matches` take a path with the base or without it, so `navigate("/notes/8")` and `navigate("/app/notes/8")` go to the same place. A URL outside the base renders the fallback, and a link outside it is left to the browser, so the rest of the site keeps working around the application. [Building and serving](/guide/deploying/) covers setting the base for the build and the server.

## Head metadata

`head` sets the document title and description per route, as a static object or as a function of the parameters and loaded data.

The same metadata is `router.head`, a signal the server renders with `renderHead` from `@zerolith/router/server` (see [Server rendering](/guide/server-rendering/)). `router.ready` settles once the initial navigation, loader included, has committed; await it before hydrating.
