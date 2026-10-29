---
title: Server rendering
description: Rendering views to HTML with no DOM, with the same escaping and URL rules as the browser.
order: 7
---

# Server rendering

`zerolith/ssr` renders a view to an HTML string with no DOM. It works from the same scan of the template strings the browser uses and from the same binding rules, and a test asserts that the two renderers produce the same markup for the same view.

@include packages/zerolith/test/examples/ssr.example.test.ts#render

Signals are read once. `each` and `when` render their current state. Property, event, and ref bindings are client-only and render nothing. Effects created while rendering, inside `each` rows, `when` branches, and computed values, are disposed before the string is returned.

`renderStyles` returns a `<style>` element per `css` literal created so far, for the document head.

@include packages/zerolith/test/examples/ssr.example.test.ts#styles

## Hydration

The rendered markup carries comment markers around every bound value. `hydrate(view, container)` binds the same view to those nodes instead of creating new ones: text nodes, attributes, keyed rows, and branches are adopted in place, and signals, listeners, properties, and refs are attached. Where the markup and the view disagree, the differing part is rendered on the client, a `hydration_mismatch` warning is reported, and the result's `mismatches` list says what differed.

@include packages/zerolith/test/examples/hydrate.example.browser.test.ts#hydrate

This documentation site is rendered this way: its page shell is a zerolith view, the build writes the strings to disk, and the search box in the navigation is an island hydrated in the browser from the production build through an import map, with no bundler anywhere in the site.

## A routed application

The router works without a window. Create it on the server with no `window`, navigate to the request's path, and the outlet, the current match, and the head metadata are what the browser would have. Rendering a request is then one function from `Request` to `Response`, on any runtime with those two classes: Node, Deno, Bun, a worker, or a server written around them.

@include packages/router/test/examples/server.example.test.ts#handler

The status follows the match: a URL nothing matched renders the fallback with 404. A loader that throws rejects `navigate`, so the handler can answer with a problem or let the server's error handling take over. `renderHead`, from `@zerolith/router/server` so the browser entry never loads the server renderer, writes the route's `head` as `<title>` and `<meta name="description">`, escaped like every other value.

In the browser, create the router the usual way and wait for `ready` before hydrating, so the initial navigation, including its loader, has committed and the outlet shows the same route the server rendered.

@include packages/router/test/examples/hydrate.example.browser.test.ts#hydrate

The loader runs again in the browser during that initial navigation. Routes whose data is expensive can read it from a `<script type="application/json">` the server embedded instead of fetching it twice; the framework leaves that choice to the application.
