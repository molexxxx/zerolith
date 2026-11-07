---
title: Embed it
description: Put the built widget on a plain HTML page served by another server, post to the example handler on another origin, and use it from another framework's page.
order: 9
---

# Embed it

The widget is built. This step puts it where it is going: on a page that knows nothing about zerolith, served by a server that is not zerolith's, posting to a backend on another origin.

## A plain page

Make a folder for a page of another site, outside the project, and copy the built script into it. From the project folder:

```sh
mkdir ../site
cp dist/feedback-widget.js ../site/
```

Create `../site/index.html`:

@include packages/zerolith/test/fixtures/widget/embed/site/index.html

That is everything a host page does: one script tag, the element with its attributes, a custom property in its own styles, and, if it wants them, a listener for the events. Text inside the element, such as a sentence for a visitor whose browser cannot run the script, shows until the script runs, and the widget replaces it.

## Serve it and post to the handler

Stop the dev server if it is running, since it holds the handler's port, and start the handler on its own, from the project folder:

```sh
node server/main.ts
```

Then, in a second terminal, serve the `site` folder with any static file server. With Python installed, as `python` rather than `python3` on Windows:

```sh
cd ../site
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000/. The widget appears in the page's font, with the page's own accent color. Answer the question and press Send. The page is on port 8000 and the handler on port 3000, which makes them two origins, so the browser sends the preflight first, the handler's CORS answer allows the post, and the post goes through. The status line thanks you, the handler's terminal prints the feedback, and the page's console logs `feedback-sent`.

Any backend that answers the contract takes the place of the example handler. Point `api` at it, and nothing in the widget changes.

A page with a Content-Security-Policy adds the script's origin to `script-src`, unless the page serves the file itself, and the api's origin to `connect-src`. The widget's styles are constructed stylesheets, which `style-src` does not restrict, so they need nothing.

## In another framework's page

The element is a DOM element, so a framework renders it as it renders a `div`. The script tag goes once in the page's HTML shell, such as its `index.html`, and the templates use the element by name:

| Framework | The element | Listening to an event |
| --- | --- | --- |
| React 19 | `<feedback-widget api="/api" question={question} />` | `onfeedback-sent={handler}` on the element |
| Vue | `<feedback-widget api="/api" :question="question" />`, with the name marked as a custom element through `isCustomElement` in the compiler options | `@feedback-sent="handler"` |
| Angular | `<feedback-widget api="/api" [question]="question" />`, with `CUSTOM_ELEMENTS_SCHEMA` in the component | `(feedback-sent)="handler($event)"` |

Each sets `question` through the path it prefers, a property or an attribute, and both reach the same signal, so the widget follows the framework's state as it changes. In TypeScript, React's JSX types do not know the element until you declare it under `JSX.IntrinsicElements`. The [custom elements guide](../../guide/elements.md) covers the rest of the boundary, including a signal shared with the page around the element.

A page that puts the widget inside a shadow root, as a web component of its own might, needs nothing more. The shadow root adopts the widget's styles when the widget renders there, and the page hears the events, since they are `composed`.

## Where to go next

The widget is one custom element, its contract one JSON file, and its build one script. From here:

- The [custom elements guide](../../guide/elements.md) covers what `define` does at each point in an element's life.
- The [typed client guide](../../guide/client.md) covers the rest of `@zerolith/client`, including queries that follow signals, for a widget that also reads from its backend.
- The [styles guide](../../guide/styles.md) explains how a scope works, for a widget with more than one styled part.
- The [reference](https://zerolith.dev/reference/zerolith/) lists every export with its documentation.
