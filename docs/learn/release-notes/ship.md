---
title: Build and ship
description: Build the reader for production, check that links straight to a release and to a search work, and put it on a host.
order: 8
---

# Build and ship

The reader is done. The last step builds it, and checks the one thing an app with its own addresses needs from a host.

## Build

```sh
npm run build
```

`zerolith build` writes the app to `dist/`. It copies `public/` in as it is, so the releases end up at `dist/data/releases.json`. The built app loads them from `/data/releases.json`, the same as while you developed it.

## Check it

```sh
npm run preview
```

`zerolith preview` serves `dist/` the way a website host would. Open the address it prints. Then open these two addresses directly:

- a release, such as `/releases/2.3.0`
- a search, such as `/releases?q=photo`

Neither one is a file. The preview answers with `index.html`, the app starts, and the router shows the page the address names.

## Ship it

Any static host can serve `dist/`, as long as an address that doesn't match a file answers with `index.html`. Without that setting, a link straight to a release shows a "not found" page.

The packing list's [build and ship step](../packing-list/ship.md) covers the build itself. [Building and serving](../../guide/deploying.md) has the setup for each kind of host, along with serving the app under a path such as `/notes/`, and caching.

## Where to go next

You've loaded data with a resource, shown its loading and error states, given each release its own page and title, written dates for the reader, and kept a search in the address. From here:

- The next tutorial, [a widget for any backend](../widget/index.md), builds a custom element that any site can add with one script tag.
- [Routing](../../guide/routing.md) covers route loaders, pages that load their code later, and navigating from code.
- [Signals](../../guide/signals.md#async-values) covers the rest of `resource`, such as loading again when its params change.
- [State](../../guide/state.md) covers the rest of `@zerolith/state`, such as a value kept in storage.
- [Internationalization](../../guide/i18n.md) covers letting the reader choose a language, and translated messages.
