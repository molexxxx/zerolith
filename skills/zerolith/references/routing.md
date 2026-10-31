<!-- Generated from docs/guide/routing.md by npm run skills. Edit the guide, then regenerate. -->

# Routing

`@zerolith/router` is a client-side router. The route table is inference-only: parameters come from each path string, and `router.href("release", { tag })` fails to type-check on a misspelled route or a missing parameter.

## The route table

```ts
import { html } from "zerolith";
import { createRouter, defineRoutes, route } from "@zerolith/router";

const releases = [{ tag: "v1", name: "First" }];

const routes = defineRoutes({
    home: route({
        path: "/",
        view: () => html`<h1>Home</h1>`,
        head: { title: "Home" }
    }),
    release: route({
        path: "/releases/:tag",
        load: async ({ params }) => releases.find((release) => release.tag === params.tag),
        view: ({ params, data }) => html`<h1>${params.tag}: ${data?.name ?? "unknown"}</h1>`,
        head: ({ data }) => ({ title: data?.name ?? "Unknown release" })
    })
});

const router = createRouter(routes, { fallback: () => html`<h1>Not found</h1>` });
const first = router.href("release", { tag: "v1" });   // "/releases/v1"
```

Write `load` before `view` so the loader's result type flows into the view. A route's `load` and lazy view resolve before the URL changes; `router.pending` is true meanwhile, and a navigation that is superseded by a newer one is discarded. A view declared with `lazy()` loads as a chunk of its own, and with `@zerolith/vite` a build that also imports it statically fails with [`lazy_module_not_split`](https://molexxxx.github.io/zerolith/e/lazy_module_not_split/) instead of quietly bundling it into the page.

## Links and navigation

Plain anchors navigate. One delegated listener handles same-origin links clicked without modifier keys and leaves `download`, `target`, and `rel="external"` links, and any link with a modifier key, to the browser.

```ts
import { html, render } from "zerolith";

render(html`
    <nav>
        <a href=${router.href("home")}>Home</a>
        <a href=${first}>First release</a>
    </nav>
    <main>${router.outlet()}</main>`, "#app");

// From script, such as after saving a form:
await router.navigate("/missing");      // nothing matches: the fallback renders
```

Back and forward restore the scroll position; a new navigation scrolls to the top or to the hash. A link to a hash on the page shown is left to the browser, and back and forward between the entries it adds move to the hash without loading the page again. Pass `scroll: false` to keep control of scrolling.

A navigation whose loader fails calls `onError` with the error and the URL; without `onError`, `navigate` rejects. A navigation that a newer one replaces before it commits is canceled rather than failed: its loader's `abort` signal fires, and `onError` is not called for it.

## Under a base path

An application served under a path, such as `/app/`, passes it as `base`; `import.meta.env.BASE_URL` carries the base `zerolith dev`, `zerolith build`, and Vite were given, so one line follows all of them:

```ts
const router = createRouter(routes, { base: import.meta.env.BASE_URL });
```

Route paths stay relative to the base: `"/notes/:id"` matches `/app/notes/7`, and `href("note", { id: "7" })` returns `/app/notes/7`. `navigate` and `matches` take a path with the base or without it, so `navigate("/notes/8")` and `navigate("/app/notes/8")` go to the same place. A URL outside the base renders the fallback, and a link outside it is left to the browser, so the rest of the site keeps working around the application. [Building and serving](deploying.md) covers setting the base for the build and the server.

## Head metadata

`head` sets the document title and description per route, as a static object or as a function of the parameters and loaded data.

The same metadata is `router.head`, a signal the server renders with `renderHead` from `@zerolith/router/server` (see [Server rendering](server-rendering.md)). `router.ready` settles once the initial navigation, loader included, has committed; await it before hydrating.
