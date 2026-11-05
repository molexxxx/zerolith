---
title: Browser
description: "The page as signals: whether it is online and visible and the window's size, shared by the page, and an element's size and whether it is in view, one per element."
order: 13
group: Building apps
---

# Browser

The browser knows whether it is online, whether the tab is shown, how big the window is, how big an element is, and whether an element has scrolled into view, and tells a page through events and observers. `@zerolith/browser` turns each into a signal, so a view binds it as it binds any other:

| Function | Gives | Shared |
| --- | --- | --- |
| `online()` | Whether the browser is online | One signal for the page |
| `visible()` | Whether the page is visible | One signal for the page |
| `windowSize()` | The window's inner width and height | One signal for the page |
| `size(target)` | An element's content box | One per element, stopped with the owner |
| `inView(target, options?)` | Whether an element is in the viewport | One per element, stopped with the owner |

Install it with `npm install @zerolith/browser`. It depends on `zerolith` alone. The reader's preferences, forced colors and reduced motion, are signals in [`@zerolith/a11y`](accessibility.md), since every interface should follow them.

## Online and visible

`online` follows `navigator.onLine` through the `online` and `offline` events, so a status line, or a queue of changes waiting to be sent, knows when the connection is back:

@include packages/browser/test/examples/browser.example.browser.test.ts#online

`visible` follows the document's visibility, so a player pauses and a clock stops while the tab is hidden:

@include packages/browser/test/examples/browser.example.browser.test.ts#visible

Each is one signal for the page, started when first asked for, and true on the server, where nothing is offline or hidden.

## The window's size

`windowSize` follows `resize`, which a browser fires once per frame, with the inner width and height; a resize to the same size changes nothing:

@include packages/browser/test/examples/browser.example.browser.test.ts#windowSize

A layout that depends on the window's width alone is a media query, which CSS handles on its own; the signal is for what code must know, such as how many rows a virtual list draws. On the server the size is 0 by 0.

## An element's size

`size` measures an element's content box, the space inside its padding, and keeps it current through one `ResizeObserver` shared by every measured element. It takes the element, or the signal a `ref` fills, which measures the element it holds and is 0 by 0 while it holds none, so a component measures its own root:

@include packages/browser/test/examples/browser.example.browser.test.ts#size

An element not yet in the document, as one a `ref` has just filled, is 0 by 0 until the observer first reports it, a frame later. The measuring stops with the enclosing owner, as a component's effects do, and lives for the page when there is none. On the server the size is 0 by 0.

## In view

`inView` says whether an element intersects the viewport, through an `IntersectionObserver`, so content loads when the reader scrolls near it. `rootMargin` extends the viewport, as `"200px"` does to start a little ahead of the scroll, and `threshold` says how much of the element must show, from 0 for any part to 1 for all of it. It is false until the observer first reports:

@include packages/browser/test/examples/browser.example.browser.test.ts#inView

Like `size`, it takes the element or a `ref` signal, stops with the enclosing owner, and is false on the server. A threshold outside 0 to 1, or a root margin the browser refuses, fails with `in_view_options_invalid`.
