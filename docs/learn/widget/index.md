---
title: Widget for any backend
description: "Build a feedback widget, a custom element any site can add with one script tag, that posts to whatever backend the page names through a contract written down as JSON."
order: 4
---

# Build a widget for any backend

You'll build a feedback widget: a `<feedback-widget>` tag that asks whether a page helped, and sends the answer to a server the page chooses. Any website can add it with one script tag, whatever the site is built with.

## What you need

- Node 22.18 or newer.
- The [packing list](../packing-list/index.md) tutorial, or the same ideas: signals, `html` templates, `computed`, `when`, and events.

## Start a project

```sh
npx @zerolith/cli new feedback-widget --template ts --yes
cd feedback-widget
```

If `npx` asks to download the command line, answer `y`.

The starter is an app with several pages, but a widget is a single element. Delete the parts you won't need:

| Delete | What it was |
| --- | --- |
| `src/routes.ts` and `src/router.ts` | The list of pages and the router |
| Every file in `src/components/` | The starter's layout and pages. Your widget's file goes in this folder |
| `test/counter.browser.test.ts` | The counter's test. The widget gets its own in the testing step |
| `public/data/` | The data the starter's pages loaded |

Then remove the two packages only the app used, the router and the in-page inspector:

```sh
npm uninstall @zerolith/router @zerolith/devtools
```

What's left is what a widget needs: `zerolith`, the dev server and the build from `@zerolith/cli`, TypeScript, the linter, and the test tools.

Two things to know before you start:

- `src/main.ts` still imports what you deleted, until the first step replaces it. Start the dev server in that step.
- `npm test` has nothing to run until the testing step.

`README.md` and `AGENTS.md` still describe the starter app. Update them whenever you like.

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
