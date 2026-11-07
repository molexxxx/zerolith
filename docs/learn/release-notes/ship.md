---
title: Build and ship
description: Build the reader for production, check that links straight to a release and to a search work, and put it on a host.
order: 8
---

# Build and ship

The reader is done. The last step builds it and checks the one thing an app with addresses of its own needs from a host.

## Build

```sh
npm run build
```

`zerolith build` writes the app to `dist/`, and copies `public/` into it as it is, so the releases are at `dist/data/releases.json`, which the built app loads from `/data/releases.json` as it did while you developed it.

## Check it

```sh
npm run preview
```

`zerolith preview` serves `dist/` the way a static host does. Open the address it prints, then open a release's address directly, such as `/releases/2.3.0`, and a search, such as `/releases?q=photo`. There is no file at either path: the preview answers with `index.html`, the app starts, and the router shows the page the address names.

## Ship it

`dist/` is static files, so any static host serves it, as long as an address that matches no file answers with `index.html`; without that fallback, a link straight to a release is a 404. The packing list's [build and ship step](../packing-list/ship.md) covers the build itself, and [building and serving](../../guide/deploying.md) covers each kind of host, serving the app under a path such as `/notes/`, and caching.

## Where to go next

You have loaded data with a resource, shown its loading and error states, given each release a page and a title, written dates for the reader, and kept a search in the address. From here:

- [Routing](../../guide/routing.md) covers route loaders, lazy pages, and navigating from code.
- [Signals](../../guide/signals.md#async-values) covers the rest of `resource`, such as loading again when its params change.
- [State](../../guide/state.md) covers the other functions of `@zerolith/state`, such as a value kept in storage.
- [Internationalization](../../guide/i18n.md) covers the reader's choice of language and translated messages.
