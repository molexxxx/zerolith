---
title: Server rendering
description: Rendering views to HTML with no DOM, with the same escaping and URL rules as the browser, hydrating them in place, and serving a routed application.
order: 8
group: Building apps
---

# Server rendering

A zerolith application is a single-page application first: the starter renders in the browser, and that is the right default for most screens. Rendering on the server is there for the pages that need it, when content should show before any script runs, when search engines and link previews should read the page, or when a form should work before its script loads.

`zerolith/ssr` renders a view to an HTML string with no DOM. It works from the same scan of the template strings the browser uses and from the same binding rules, and a test asserts that the two renderers produce the same markup for the same view.

## Rendering a view

@include packages/zerolith/test/examples/ssr.example.test.ts#render

Each part of a template renders the way the browser would show it at that moment:

| In the template | On the server |
| --- | --- |
| `${value}` as text | The value, read once and escaped; `null`, `undefined`, and booleans render nothing |
| `name=${value}` | The attribute, escaped; left out when the value is `null` or `undefined`, and left out with an `unsafe_url_blocked` warning when a URL attribute holds an unsafe URL |
| `?name=${value}` | The attribute when the value is truthy |
| `.name=${value}`, `@event=${handler}`, `ref=${signal}` | Nothing; the browser attaches them when it hydrates |
| `each` and `when` | Their current rows or branch |
| `unsafeHtml(markup)` | The markup as it is |

Effects created while rendering, inside `each` rows, `when` branches, and computed values, are disposed before the string is returned. A component called before `renderToString` runs outside that scope, exactly as in the browser, and owns its own effects.

## Styles

`renderStyles()` returns one `<style>` element for each stylesheet created so far, in creation order, for the document head, so the page is styled before any script runs:

@include packages/zerolith/test/examples/ssr.example.test.ts#styles

A `css` literal, or a stylesheet imported with `?scoped`, creates its stylesheet when its module loads, so importing the components is enough for their styles to be included.

## Hydration

The rendered markup carries comment markers around every bound value. `hydrate(view, target)`, with the target an element or a CSS selector for one as `render` takes it, binds the same view to those nodes instead of creating new ones: text nodes, attributes, keyed rows, and branches are adopted in place, and signals, listeners, properties, and refs are attached.

@include packages/zerolith/test/examples/hydrate.example.browser.test.ts#hydrate

Where the markup and the view disagree, the differing part is rendered on the client, a `hydration_mismatch` warning is reported, and the result's `mismatches` list says what differed:

| `kind` | Means |
| --- | --- |
| `text` | A text node differed |
| `missing` | Nodes the view expected were absent |
| `extra` | Nodes the view did not expect were present |
| `structure` | A template's nodes did not line up |
| `root` | No server-rendered part was found |

Without any server-rendered markup in the target, `hydrate` falls back to `render`.

> [!TIP]
> `hydrationMismatches(() => view)` from `@zerolith/test` renders a view on the server, hydrates a second copy over that markup, and returns every disagreement, so a test can assert that a component hydrates cleanly.

## A routed application

The router works without a window. Create it on the server, where there is no `window`, or with `window: null` where one exists, as in a test; navigate to the request's path; and the outlet, the current match, and the head metadata are what the browser would have. Rendering a request is then one function from `Request` to `Response`, on any runtime with those two classes: Node, Deno, Bun, a worker, or a server written around them.

@include packages/router/test/examples/server.example.test.ts#handler

The status follows the match: a URL nothing matched renders the fallback with 404. A loader that throws rejects `navigate`, so the handler can answer with a problem or let the server's error handling take over. `renderHead` and `renderRouteState` come from `@zerolith/router/server`, so the browser entry never loads the server renderer: `renderHead` writes the route's `head` as `<title>` and `<meta name="description">`, escaped like every other value, and `renderRouteState` writes the data the browser needs to skip the loader.

In the browser, create the router the usual way and wait for `ready` before hydrating, so the initial navigation has committed and the outlet shows the same route the server rendered:

@include packages/router/test/examples/hydrate.example.browser.test.ts#hydrate

The two sides do the same steps with their own tools:

| Step | On the server | In the browser |
| --- | --- | --- |
| Create the router | `createRouter(routes)`, with no window | `createRouter(routes)` |
| Reach the URL | `await router.navigate(path)` | `await router.ready` |
| Render | `renderToString(App(router))` | `hydrate(App(router), "#app")` |
| The head | `renderHead(router.head.get())` | The router sets `document.title` and the description on each navigation |
| The data | `renderRouteState(router)` | Read once, for the initial navigation |

The loader does not run again in the browser. `renderRouteState` writes the current route's name, URL, and loaded data into a `<script type="application/json">`; the browser router reads that script once, for its initial navigation, and takes the data from it when the route and the URL still match. The page is interactive as soon as the script has loaded, and the data the user sees is the data the server rendered.

> [!NOTE]
> The data goes through JSON. A loader whose data JSON cannot carry runs again in the browser, and so does one whose URL changed between rendering and hydration. Later navigations load as usual.

## This site

This documentation site is built this way. Each page is a zerolith view that `renderToString` writes to a file when the site is built. In the browser, `@zerolith/router` takes over the prerendered page, hydrates the search and the home page's figure, and moves between pages without a reload, loading zerolith from its production build through an import map, with no bundler anywhere in the site.
