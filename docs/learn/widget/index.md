---
title: Widget for any backend
description: "Build a feedback widget, a custom element any site can add with one script tag, that posts to whatever backend the page names through a contract written down as JSON."
order: 4
---

# Build a widget for any backend

You build a feedback widget: a `<feedback-widget>` element that asks whether a page helped and posts the answer to the backend the page names. Any site can add it with one script tag, whatever it is built with.

## What you need

- Node 24 or newer.
- The ideas from the [packing list](../packing-list/index.md): signals, `html` templates, `computed`, `when`, and events.

## Start a project

```sh
npx @zerolith/cli new feedback-widget --template ts --yes
cd feedback-widget
```

Answer `y` if `npx` asks to download the command line. The starter is a routed app, and a widget is one element, so delete the routed parts:

| Delete | What it was |
| --- | --- |
| `src/routes.ts` and `src/router.ts` | The route table and the router |
| Every file in `src/components/` | The layout and the starter's pages; the widget's component goes in the same folder |
| `test/counter.browser.test.ts` | The counter's test; the widget gets a test of its own in the testing step |
| `public/data/` | The data the starter's list page loaded |

Then remove the two packages only the routed application used, the router and the in-page inspector:

```sh
npm uninstall @zerolith/router @zerolith/devtools
```

What stays is what a widget needs: `zerolith`, the dev server and the build from `@zerolith/cli`, TypeScript, the linter, and Vitest with `@zerolith/test`. `src/main.ts` still imports what you removed until the first step replaces it, so start the dev server there, and `npm test` has nothing to run until the testing step. `README.md` and `AGENTS.md` still describe the routed starter; bring them up to date when you like.

## The steps

1. [Define the element](element.md): a custom element whose content is a zerolith view.
2. [Attributes](attributes.md): the question the host page asks, as a signal.
3. [The contract](contract.md): the request and every answer as an OpenAPI document, and an example handler to post to.
4. [Send the feedback](sending.md): post through the typed client and announce what happened.
5. [Events](events.md): tell the host page when feedback was sent or failed.
6. [Styles and theming](styles.md): scoped styles, and custom properties the host page sets.
7. [Testing](testing.md): a browser test with the example handler standing in for the backend.
8. [Build one script](build.md): the production build as the one file a host page loads.
9. [Embed it](embed.md): a plain HTML page on another server, and other frameworks' pages.
