---
title: Embed it
description: Put the built widget on a plain HTML page served by another server, post to the example handler on another origin, and use it from another framework's page.
order: 9
---

# Embed it

The widget is built. Now put it where it's meant to go: on a page that knows nothing about zerolith, served by a different server, sending to a server on another address.

## A plain page

Make a folder for another site's page, outside the project, and copy the built script into it. From the project folder:

```sh
mkdir ../site
cp dist/feedback-widget.js ../site/
```

Create `../site/index.html`:

@include packages/zerolith/test/fixtures/widget/embed/site/index.html

That's everything a site needs to do:

- one script tag
- the element, with its attributes
- a custom property in its own styles, if it wants its own colors
- a listener for the events, if it wants them

Text inside the element shows until the script runs, and then the widget replaces it. That's useful as a message for a visitor whose browser can't run the script.

## Serve it and send feedback

The page sends to the example server on port 3000. If `npm run dev` is still running, that server is already up. If not, start it by itself, from the project folder:

```sh
node server/main.ts
```

Then, in a second terminal, serve the `site` folder with any static file server. If you have Python, use this. On Windows, type `python` instead of `python3`:

```sh
cd ../site
python3 -m http.server 8000 --bind 127.0.0.1
```

## Try it

Open `http://127.0.0.1:8000/`. The widget appears in the page's font, with the page's own accent color. Answer the question and press **Send**.

The page is on port 8000 and the server is on port 3000, which makes them two different sites. So the browser first asks the server for permission, the server's CORS answer allows it, and the feedback is sent. The status line thanks you, the server's terminal prints the feedback, and the page's console logs `feedback-sent`.

Any server that follows the contract can take the example server's place. Point `api` at it, and nothing in the widget changes.

A page with a Content-Security-Policy needs two additions:

- the script's address in `script-src`, unless the page serves the file itself
- the `api` address in `connect-src`

The widget's styles don't need anything, because `style-src` doesn't restrict the kind of stylesheets zerolith uses.

## In another framework's page

The widget is an HTML element, so a framework treats it like a `div`. Put the script tag once in the app's main HTML page, such as its `index.html`. Then use the element by name in any template:

| Framework | The element | Listening to an event |
| --- | --- | --- |
| React 19 | `<feedback-widget api="/api" question={question} />` | `onfeedback-sent={handler}` on the element |
| Vue | `<feedback-widget api="/api" :question="question" />`, with the name marked as a custom element through `isCustomElement` in the compiler options | `@feedback-sent="handler"` |
| Angular | `<feedback-widget api="/api" [question]="question" />`, with `CUSTOM_ELEMENTS_SCHEMA` in the component | `(feedback-sent)="handler($event)"` |

Each framework sets `question` its own way, as a property or an attribute, and both reach the same signal. So the widget follows the framework's state as it changes. In TypeScript, React doesn't know the element until you declare it under `JSX.IntrinsicElements`. The [custom elements guide](../../guide/elements.md) covers more, such as sharing a signal between the widget and the page around it.

A site can also put the widget inside a shadow root, as its own web components might. It works the same: the widget brings its styles with it, and the events still reach the page, because they're `composed`.

## Where to go next

The widget is one custom element, its contract is one JSON file, and its build is one script. From here:

- The [custom elements guide](../../guide/elements.md) covers what `define` does at each point in an element's life.
- The [typed client guide](../../guide/client.md) covers the rest of `@zerolith/client`, such as reading data from a server as well as sending it.
- The [styles guide](../../guide/styles.md) explains how scoped styles work, for a widget with more than one styled part.
- The [reference](https://zerolith.dev/reference/zerolith/) lists everything zerolith exports.
