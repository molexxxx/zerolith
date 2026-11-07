---
title: Build a widget for any backend
description: "Build a feedback widget, a custom element any site can add with one script tag, that posts to whatever backend the page names through a contract written down as JSON."
order: 4
---

# Build a widget for any backend

In this tutorial you build a feedback widget: a `<feedback-widget>` element that asks whether a page helped, takes an optional comment, and posts the answer to the backend the page names. Any site can add it with one script tag, whatever it is built with and whatever its backend runs on, because the widget asks only two things of a page: that it loads the script, and that it names an address that answers a short contract.

Each step adds one idea and explains why it works the way it does before showing the code. Every file a step shows is run by zerolith's own test suite, so what you type is what was tested.

## What you need

- Node 24 or newer. Check with `node --version`.
- A terminal and an editor.
- The ideas the [packing list](../packing-list/index.md) teaches: signals, `html` templates, `computed`, `when`, and events. This tutorial uses them without introducing them again.

## Start a project

```sh
npx @zerolith/cli new feedback-widget --template ts --yes
cd feedback-widget
```

The first time, `npx` asks before it downloads the command line; answer `y`. The starter is a routed application with three pages. A widget is one element, so the routed parts go. Delete these:

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
2. [Attributes and properties](attributes.md): the question the host page asks, as a signal.
3. [A contract for any backend](contract.md): the request and every answer as an OpenAPI document, and an example handler to post to.
4. [Send the feedback](sending.md): post through the typed client and announce what happened.
5. [Events](events.md): tell the host page when feedback was sent or failed.
6. [Styles and theming](styles.md): scoped styles, and custom properties the host page sets.
7. [Testing](testing.md): a browser test with the example handler standing in for the backend.
8. [Build one script](build.md): the production build as the one file a host page loads.
9. [Embed it](embed.md): a plain HTML page on another server, and other frameworks' pages.
