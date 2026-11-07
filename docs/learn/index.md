---
title: Learn zerolith
description: "Tutorials that each build a small app from a fresh zerolith project, one idea per step. Every file a step shows is run by zerolith's test suite."
order: 0
---

# Learn zerolith

Each tutorial builds one small app from a fresh `zerolith new` project, one idea per step, and explains why it works before it shows the code. Every file a step shows runs in zerolith's own test suite, so what you type is what was tested. They need Node 24 or newer and no knowledge of zerolith.

| Tutorial | What you build | What it teaches |
| --- | --- | --- |
| [Build a packing list](packing-list/index.md) | A list you add to, check off, filter, and undo, kept between visits | Signals, templates, events, components, derived values, effects, storage, styles, tests, and a production build |
| [Build a sign-up form](sign-up-form/index.md) | A sign-up page that checks what you type, sends the form to a server, and shows the server's answer next to each field | Native forms, rules shared with the server, pending state, problem details, the dev server's proxy, focus, and announcements |
| [Build a release notes reader](release-notes/index.md) | A list of an app's releases loaded from a JSON file, a page for each release, and a search kept in the address | Loading data with a resource, loading and error states with retries, route parameters and titles, dates in the reader's language, a debounced search, and tests with a stand-in for fetch |
| [Build a widget for any backend](widget/index.md) | A feedback element any site adds with one script tag, posting to whatever backend the page names | Custom elements, attributes and properties as signals, a contract written as JSON, the typed client, events, theming with custom properties, and building one script to embed |

Start with the packing list if zerolith is new to you: it covers the ideas the other tutorials build on, and they say which of them they use without introducing again. The [guide](../guide/index.md) explains each idea on its own once you know where it fits.
