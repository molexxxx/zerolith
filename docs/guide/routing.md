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

Each entry is a `route()` with up to four fields:

| Field | Takes | What it does |
| --- | --- | --- |
| `path` | A pattern, such as `"/releases/:tag"` | Matched against the URL; its parameters become `params` |
| `view` | A function of `{ params, data, url }`, or `lazy(() => import(...))` | Renders the page, once per navigation to the route |
| `load` | An async function of `{ params, url, abort }` | Runs before the URL changes; what it resolves to is the view's `data` |
| `head` | `{ title, description }`, or a function of `{ params, data, url }` that returns it | The document's title and description while the route is shown |

A page component is a view as it is, and a page small enough to write in place can be one, as `view: () => <h1>About</h1>`. A route's `load` and lazy view resolve before the URL changes, and `router.pending` is true meanwhile. A view declared with `lazy()` loads as a chunk of its own the first time a reader opens it, and `zerolith build` and the Vite plugin fail a build that also imports it statically, with `lazy_module_not_split`, instead of quietly bundling it into the page.

> [!TIP]
> Write `load` before `view` in an entry. TypeScript infers the data type from the fields in the order they are written, so the view, and the page component it renders, then see `data` typed.

### Path patterns

| Pattern | Matches | Params |
| --- | --- | --- |
| `/` | The root | `{}` |
| `/settings` | `/settings` and `/settings/`; matching is case-sensitive | `{}` |
| `/releases/:tag` | One segment after `/releases/`, as `/releases/1.0` | `{ tag: "1.0" }` |
| `/files/*path` | Everything after `/files/`, slashes included, as `/files/docs/a.md` | `{ path: "docs/a.md" }` |

Parameter values are decoded from the URL, and `href` encodes them back, a `*rest` value one segment at a time, so its slashes stay slashes. A path whose percent escapes are malformed matches no route and renders the fallback. Routes are tried in the order the table lists them, and the first match wins, so a `*rest` route that would also match a more specific path goes after it.

## Pages are components

`src/components/release.tsx` is the release page. It receives the path's parameters and the loader's data as its props, typed by the route, and keeps its loader and its title beside it:

@include packages/router/test/examples/components/release.tsx

A page component receives the route's context as its props:

| Prop | Holds |
| --- | --- |
| `params` | The path's parameters, as strings, typed from the path |
| `data` | What `load` resolved to, typed from the loader, or `undefined` for a route without one |
| `url` | The page's full URL, with its query string and hash |

A loader receives `params` and `url` too, and `abort`, an `AbortSignal` that fires when a newer navigation replaces this one. Pass it to `fetch`, so a request nobody is waiting for stops.

A page composes other components as any component does, as `ReleasePage` does with `Notes`. With html templates instead of JSX, a component is called as the function it is, `${Notes({ items: data.notes })}`; the [templates guide](templates.md) shows both spellings.

Every page renders inside an owner of its own, so its signals, effects, and `onDispose` cleanups end when the reader moves to another route. The settings page starts a clock and leaves stopping it to `onDispose`, and navigates from code when the reader is done:

@include packages/router/test/examples/components/settings.tsx

## The layout

`src/router.ts` creates the router over the route table, and its fallback renders when no route matches. It takes the table as a function because the table imports the page components, and a component that builds links imports this module back; a function works whichever of them loads first, such as `routes.ts` in a test. A table given as it is suits a router no component imports, as on a server:

@include packages/router/test/examples/router.ts

| Option | Default | What it does |
| --- | --- | --- |
| `fallback` | Nothing renders | Renders when no route matches, given the URL |
| `failed` | Nothing renders | Renders in place of a page whose view throws as a navigation shows it, given the error and the URL |
| `head` | None | The title and description every page starts from, as an object or a function of the URL and the matched route's name; see [Head metadata](#head-metadata) |
| `base` | `"/"` | The path the application is served under; see [Under a base path](#under-a-base-path) |
| `onError` | `navigate` rejects | Receives the error and the URL when a loader, a lazy import, or a route's `head` throws, which leaves the page as it was, or when the new page throws as it renders, after the URL changed, which leaves the outlet empty or shows `failed` |
| `scroll` | `true` | `false` leaves scrolling to the application |
| `observe` | None | Receives each navigation's start, commit, error, and cancel; see [Observability](observability.md) |
| `window` | The global window | `null` attaches to none, as on the server |

> [!WARNING]
> These modules import each other in a loop: `router.ts` imports the route table, the table imports the page components, and a component that builds links imports `router.ts` back. The loop is safe while components read `router` inside their functions, which run after every module has loaded, as every component on this page does. A use at a module's top level, such as `const home = router.href("home");` outside any function, runs before the router exists, and the app fails to start with an error such as `Cannot access 'router' before initialization`.

`src/layout.tsx` places the current page, `router.outlet()`, under the navigation, and `router.matches()` tells each link whether its page is the one shown:

@include packages/router/test/examples/layout.tsx

`src/main.tsx` waits for the first route and renders the layout:

@include packages/router/test/examples/main.tsx

## What the router offers

| Member | What it is |
| --- | --- |
| `outlet()` | The current page as a view, for the layout to place |
| `href(name, params)` | The path of a named route, with the base and the parameters encoded; a misspelled name or a missing parameter fails to type-check, and a name the table does not hold throws `route_name_unknown`, so a JavaScript project cannot ship a link to the home page in its place |
| `navigate(to, { replace, reload, shallow })` | Goes to a path or URL after the route's loader, and resolves once the page has changed; `replace` replaces the history entry instead of adding one, `reload` runs the loader and renders the page again even for the URL shown, as after a form's redirect back to the page, and `shallow` keeps the page shown when the path is its own, whatever the query. A URL on another origin is left to the browser, through `location.assign`, or `location.replace` with `replace` |
| `matches(path, { exact })` | A signal, true while the URL is at `path` or below it, segment by segment, so `/notes` covers `/notes/7` and not `/notesy`; `exact` requires the path itself |
| `current` | A signal of the current match, with its `name`, `params`, `url`, and `data`, or `undefined` while the fallback shows |
| `url` | A signal of the current URL |
| `pending` | A signal, true while a navigation loads |
| `head` | A signal of the current route's title and description |
| `ready` | A promise that settles once the first navigation, loader included, has committed |
| `dispose()` | Detaches the router from the window |

## Links and navigation

Plain anchors navigate, as the links in the layout and the home page do. One delegated listener handles same-origin links clicked without modifier keys and leaves `download`, `target`, and `rel="external"` links, and any link with a modifier key, to the browser. Code navigates with `router.navigate`, as the settings page does.

Back and forward restore the scroll position, and so does a reload, since the router keeps each position in its history entry's state; a new navigation scrolls to the top or to the hash. The first navigation of a fresh visit leaves the scroll where the browser and the reader put it, since a server-rendered page is readable, and scrollable, before the router starts.

A link to a hash on the page shown is left to the browser, and back and forward between the entries it adds move to the hash without loading the page again. A link, or a `navigate()`, to the URL of the page shown keeps the page as it is, an open `<details>` and the focus included: no loader runs and no view renders, the history entry follows the link, and the page moves to the hash or the top.

A URL whose query differs is another page, and `navigate(url, { reload: true })` loads and renders the page shown again on purpose, as after a form's redirect back to it.

A page that keeps its own state in the query, such as a search the reader types, writes it with `navigate(url, { replace: true, shallow: true })`. A shallow navigation to the page's own path keeps the page, so the field keeps its focus and its text: only the URL and `router.url` change, and the page stays where it is scrolled, unless the URL names a hash. The page reads the query from `router.url`. Back and forward between entries a shallow navigation added keep the page too. `router.current` stays the match the page was built from, and a link or a navigation without `shallow` still loads the page again. Pass `scroll: false` to keep control of scrolling.

A navigation whose loader fails calls `onError` with the error and the URL; without `onError`, `navigate` rejects, and a navigation a link or the history started rejects unobserved, which the browser reports as an unhandled rejection. A back or forward that fails moves the history back to the entry of the page still shown, so the address bar and the page agree.

A page that throws as it renders fails the navigation after the URL changed: the outlet shows nothing at the new URL, under the new page's head, rather than keeping the page before under a URL it does not match. `failed` gives the outlet something to show instead, such as a message and a link home, and receives the error and the URL; the navigation still fails with the error, so `onError` can report it. On the server a view renders inside `renderToString`, outside any navigation, so a throw there reaches its caller. The route's `head` runs before the URL changes, so one that throws fails the navigation the same way and leaves the page as it was. A navigation that a newer one replaces before it commits is canceled rather than failed: its loader's `abort` signal fires as the newer one starts, wherever it goes, and `onError` is not called for it.

## Under a base path

An application served under a path, such as `/app/`, passes it as `base`; `import.meta.env.BASE_URL` carries the base `zerolith dev`, `zerolith build`, and Vite were given, so one line follows all of them:

```ts
const router = createRouter(() => routes, { base: import.meta.env.BASE_URL });
```

Route paths stay relative to the base: `"/notes/:id"` matches `/app/notes/7`, and `href("note", { id: "7" })` returns `/app/notes/7`. `navigate` and `matches` take a path with the base or without it, so `navigate("/notes/8")` and `navigate("/app/notes/8")` go to the same place. A URL outside the base renders the fallback, and a link outside it is left to the browser, so the rest of the site keeps working around the application. [Building and serving](deploying.md) covers setting the base for the build and the server.

## Head metadata

`head` sets the document title and description per route, as a static object, as the home route's is, or as a function of the parameters and loaded data, as `releaseHead` is.

The router's own `head` option gives the fields every page starts from, so a site's name and description are written once:

```ts
const router = createRouter(() => routes, {
    head: ({ name }) => ({
        title: name === undefined ? "Not found | Notes" : "Notes",
        description: "A notebook that runs on zerolith."
    }),
    fallback: (url) => NotFound({ url })
});
```

A route's fields go over the defaults field by field, and the fallback shows the defaults; as a function, the option receives the URL and the matched route's name, undefined for the fallback, so the not-found page can have a title of its own. On every commit the document shows the merged head as a whole, so a page never keeps the previous page's values: a field that neither the defaults nor the route gives goes back to what the page loaded with, the `<title>` and `<meta name="description">` written in `index.html`, which makes those the defaults of an application that sets only titles per route.

The same metadata is `router.head`, a signal the server renders with `renderHead` from `@zerolith/router/server` (see [Server rendering](server-rendering.md)). `router.ready` settles once the initial navigation, loader included, has committed; await it before hydrating.
