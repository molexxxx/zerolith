---
title: Build and ship
description: Build the packing list for production, check the build locally, and put it on a host.
order: 10
---

# Build and ship

The packing list is done. The last step turns your project into files you can put on a website.

## Build

```sh
npm run build
```

`zerolith build` packs your app and the packages it uses into a few small files in `dist/`.

- Scripts and stylesheets go in `dist/assets/`. Each file's name includes a code made from its contents, so a host can cache them forever. When a file changes, its name changes too.
- The `html` templates are prepared ahead of time, so the page does less work when it loads.

## Check it

```sh
npm run preview
```

`zerolith preview` serves `dist/` the way a website host would. Open the address it prints and click through the app once more. Open `/packing` directly too. It works because the preview answers any address that isn't a file with `index.html`, and the router takes it from there.

## Ship it

`dist/` holds plain files: an HTML page, scripts, a stylesheet, and the files from `public/`. Any static host can serve them, and so can any web server or your own backend.

There's one setting every host needs. An address that doesn't match a file should answer with `index.html`. Without it, a link straight to `/packing` shows a "not found" page.

[Building and serving](../../guide/deploying.md) has the setup for each kind of host. It also covers serving the app under a path such as `/app/`, caching, and working with a backend.

## Where to go next

You've used every part of a zerolith app: components, signals, lists, events, derived values, effects, styles, routes, and tests, plus `@zerolith/state` and `@zerolith/browser`. From here:

- The next tutorial, [a sign-up form](../sign-up-form/index.md), checks input as you type and shows the server's errors next to each field.
- The [guide](../../guide/index.md) explains each idea in depth, one page per idea.
- [Forms](../../guide/forms.md) shows how to send a form to a server.
- [Server rendering](../../guide/server-rendering.md) turns pages into HTML on a server.
- The [reference](https://zerolith.dev/reference/zerolith/) lists everything zerolith exports.
