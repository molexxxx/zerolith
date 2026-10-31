---
title: Build and ship
description: Build the packing list for production, check the build locally, and put it on a host.
order: 9
---

# Build and ship

The packing list is done. The last step turns the project into files a host can serve.

## Build

```sh
npm run build
```

`zerolith build` bundles the application with the packages it imports, minifies it, and writes everything to `dist/`, with every script and style sheet under `dist/assets/` named by a hash of its content, so a host can cache those files for good. The build also prepares the `html` templates ahead of time, so the template scanner is left out of the bundle and the page does less work when it loads.

## Check it

```sh
npm run preview
```

`zerolith preview` serves `dist/` the way a static host does, including the fallback that sends a deep link such as `/packing` to `index.html`, so the router can take it from there. Open the address it prints and click through the app once more.

## Ship it

`dist/` is static files: an HTML page, scripts, a style sheet, and the files from `public/`. Any static host serves it, as does any web server or the static files of your own backend. The one thing every host needs is that fallback: an address that matches no file should answer with `index.html`.

[Building and serving](../guide/deploying.md) covers each kind of host, serving under a path such as `/app/`, caching, and running the dev server next to a backend that answers your API calls.

## Where to go next

You have used every part of a zerolith application: components, signals, lists, events, derived values, effects, styles, routes, and tests. From here:

- The [guide](../guide/index.md) explains each idea in depth, one page per concept, starting from the [introduction](../guide/index.md).
- [Forms](../guide/forms.md) turns the add form into a form that posts to a server, with pending state and field errors.
- [Server rendering](../guide/server-rendering.md) renders pages to HTML on a server and hydrates them in the browser.
- The [reference](https://molexxxx.github.io/zerolith/reference/zerolith/) lists every export with its documentation.
