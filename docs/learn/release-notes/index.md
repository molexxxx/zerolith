---
title: Release notes reader
description: "A zerolith tutorial: load data with a resource, show its loading and error states, give each release a page at its own address, format dates for the reader, and keep a search in the URL."
order: 3
---

# Build a release notes reader

You build a reader for the release notes of Driftwood, a made-up journaling app: a list of releases, a page for each, dates in the reader's language, and a search that stays in the URL. The releases come from a JSON file, so several steps cover loading: what the page shows while it waits, when the request fails, and how it tries again.

## What you need

- Node 24 or newer.
- The ideas from the [packing list](../packing-list/index.md): signals, `html` templates, `each`, and `when`.

## Start a project

```sh
npx @zerolith/cli new release-notes --template ts --yes
cd release-notes
npm run dev
```

Answer `y` if `npx` asks to download the command line, and leave the server running. The steps change `src/routes.ts`, `src/components/layout.ts`, and `public/`; the packing list describes [the rest of the starter](../packing-list/index.md#what-the-starter-wrote).

## The steps

1. [Load the releases](list.md): a JSON file in `public/`, a resource that loads it, and a page that lists it.
2. [Loading and errors](loading.md): what the page says while the file loads, retries, and a button to try again.
3. [A page per release](release.md): a route with a parameter, links to it, and a title for each release.
4. [Dates for the reader](dates.md): dates in the reader's language with `@zerolith/i18n`.
5. [Search as you type](search.md): a search that waits for a pause, with `@zerolith/state`.
6. [Search in the URL](address.md): a search you can reload and share.
7. [Testing](testing.md): tests with a stand-in for `fetch`.
8. [Build and ship](ship.md): the production build, and links straight to a release.
