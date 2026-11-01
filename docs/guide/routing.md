---
title: Routing
description: The typed route table, plain anchors, loaders, head metadata, and the outlet.
order: 5
group: Building apps
---

# Routing

`@zerolith/router` is the router of a single-page application. Pages are components, the route table maps each path to one, and a layout component places the current page. Parameters come from the path strings, so `router.href("release", { tag })` fails to type-check on a misspelled route or a missing parameter.

The examples on this page are one small application, in the files a project from `zerolith new` keeps under `src/`: the route table, a component per page, the router, and the layout.

## The route table

`src/routes.ts` maps each path to the component that renders it, with an optional loader and the page's title:

@include packages/router/test/examples/routes.ts

A route's `view` takes any function of the route's context, `{ params, data, url }`, so a page component is a view as it is, and a page small enough to write in place can be, as `view: () => <h1>About</h1>`. A route's `load` and lazy view resolve before the URL changes, and `router.pending` is true meanwhile. A view declared with `lazy()` loads as a chunk of its own the first time a reader opens it, and with `@zerolith/vite` a build that also imports it statically fails with [`lazy_module_not_split`](https://molexxxx.github.io/zerolith/e/lazy_module_not_split/) instead of quietly bundling it into the page.

## Pages are components

`src/components/release.tsx` is the release page. It receives the path's parameters and the loader's data as its props, typed by the route, and keeps its loader and its title beside it:

@include packages/router/test/examples/components/release.tsx

A page composes other components as any component does, as `ReleasePage` does with `Notes`. With html templates instead of JSX, a component is called as the function it is, `${Notes({ items: data.notes })}`; the [templates guide](templates.md) shows both spellings.

Every page renders inside an owner of its own, so its signals, effects, and `onDispose` cleanups end when the reader moves to another route. The settings page starts a clock and leaves stopping it to `onDispose`, and navigates from code when the reader is done:

@include packages/router/test/examples/components/settings.tsx

## The layout

`src/router.ts` creates the router. It is a module of its own so components can import it for their links while the route table imports the components, and its fallback renders when no route matches:

@include packages/router/test/examples/router.ts

`src/layout.tsx` places the current page, `router.outlet()`, under the navigation, and `router.matches()` tells each link whether its page is the one shown:

@include packages/router/test/examples/layout.tsx

`src/main.tsx` waits for the first route and renders the layout:

@include packages/router/test/examples/main.tsx

## Links and navigation

Plain anchors navigate, as the links in the layout and the home page do. One delegated listener handles same-origin links clicked without modifier keys and leaves `download`, `target`, and `rel="external"` links, and any link with a modifier key, to the browser. Code navigates with `router.navigate`, as the settings page does.

Back and forward restore the scroll position, and so does a reload, since the router keeps each position in its history entry's state; a new navigation scrolls to the top or to the hash. A link to a hash on the page shown is left to the browser, and back and forward between the entries it adds move to the hash without loading the page again. Pass `scroll: false` to keep control of scrolling.

A navigation whose loader fails calls `onError` with the error and the URL; without `onError`, `navigate` rejects. A navigation that a newer one replaces before it commits is canceled rather than failed: its loader's `abort` signal fires, and `onError` is not called for it.

## Under a base path

An application served under a path, such as `/app/`, passes it as `base`; `import.meta.env.BASE_URL` carries the base `zerolith dev`, `zerolith build`, and Vite were given, so one line follows all of them:

```ts
const router = createRouter(routes, { base: import.meta.env.BASE_URL });
```

Route paths stay relative to the base: `"/notes/:id"` matches `/app/notes/7`, and `href("note", { id: "7" })` returns `/app/notes/7`. `navigate` and `matches` take a path with the base or without it, so `navigate("/notes/8")` and `navigate("/app/notes/8")` go to the same place. A URL outside the base renders the fallback, and a link outside it is left to the browser, so the rest of the site keeps working around the application. [Building and serving](deploying.md) covers setting the base for the build and the server.

## Head metadata

`head` sets the document title and description per route, as a static object, as the home route's is, or as a function of the parameters and loaded data, as `releaseHead` is.

The same metadata is `router.head`, a signal the server renders with `renderHead` from `@zerolith/router/server` (see [Server rendering](server-rendering.md)). `router.ready` settles once the initial navigation, loader included, has committed; await it before hydrating.
