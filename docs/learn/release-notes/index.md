---
title: Build a release notes reader
description: "A zerolith tutorial: load data with a resource, show its loading and error states, give each release a page at its own address, format dates for the reader, and keep a search in the URL."
order: 3
---

# Build a release notes reader

In this tutorial you build a reader for the release notes of Driftwood, a made-up journaling app. One page lists every release, newest first. Each release has a page of its own at an address such as `/releases/2.3.0/notes`, with its date written the way your browser's language writes dates. A search narrows the list as you type, and it stays in the address, so a search can be bookmarked, shared, or reloaded.

The releases come from a JSON file, the way most data reaches a page: by a request that takes time and can fail. Most of this tutorial is about that: what the page shows while the file loads, what it shows when the file does not arrive, and how it tries again.

Each step adds one idea and explains why it works the way it does before showing the code. Every file a step shows is run by zerolith's own test suite, so what you type is what was tested.

## What you need

- Node 24 or newer. Check with `node --version`.
- A terminal and an editor. Any editor works; one that understands TypeScript helps.
- Signals, `html` templates, `each`, and `when`. The [packing list](../packing-list/index.md) teaches them; this tutorial uses them without explaining them again.

## Start a project

`zerolith new` writes a starter application. This tutorial uses TypeScript with `html` templates:

```sh
npx @zerolith/cli new release-notes --template ts --yes
cd release-notes
npm run dev
```

The first time, `npx` asks before it downloads the command line; answer `y`. Open the address `npm run dev` prints, http://127.0.0.1:8080/ unless that port is taken, and leave the server running; it reloads the page every time you save a file.

The starter is a small routed application. The files this tutorial changes are `src/routes.ts`, the route table; `src/components/layout.ts`, the frame around every page with its navigation; and the files under `public/`, which the server sends as they are. The packing list's [tour of the starter](../packing-list/index.md#what-the-starter-wrote) describes the rest.

## The steps

1. [Load the releases](list.md): a JSON file in `public/`, a resource that loads it, and a page that lists it.
2. [Loading and errors](loading.md): what the page says while the file loads, retries, and a button to try again.
3. [A page per release](release.md): a route with a parameter, links to it, and a title for each release.
4. [Dates for the reader](dates.md): dates in the reader's language with `@zerolith/i18n`.
5. [Search as you type](search.md): a search that waits for a pause, with `@zerolith/state`.
6. [The search in the address](address.md): a search you can reload and share.
7. [Testing](testing.md): tests with a stand-in for `fetch`.
8. [Build and ship](ship.md): the production build, and links straight to a release.
