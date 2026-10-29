---
title: Routing
description: The typed route table, plain anchors, loaders, head metadata, and the outlet.
order: 4
---

# Routing

`@zerolith/router` is a client-side router. The route table is inference-only: parameters come from each path string, and `router.href("release", { tag })` fails to type-check on a misspelled route or a missing parameter.

## The route table

@include packages/router/test/examples/routing.example.browser.test.ts#table

Write `load` before `view` so the loader's result type flows into the view. A route's `load` and lazy view resolve before the URL changes; `router.pending` is true meanwhile, and a navigation that is superseded by a newer one is discarded.

## Links and navigation

Plain anchors navigate. One delegated listener handles same-origin links clicked without modifier keys and leaves `download`, `target`, and `rel="external"` links, and any link with a modifier key, to the browser.

@include packages/router/test/examples/routing.example.browser.test.ts#navigate

Back and forward restore the scroll position; a new navigation scrolls to the top or to the hash. Pass `scroll: false` to keep control of scrolling.

## Head metadata

`head` sets the document title and description per route, as a static object or as a function of the parameters and loaded data.
