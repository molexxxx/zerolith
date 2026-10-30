# Notes

A small application that uses every part of zerolith and the router, in plain JavaScript: a keyed list with search, a note page with a URL parameter, a native form with constraint validation and `ref` focus, seed data loaded through `resource`, scoped `css`, `when` for loading, error, and empty states, localStorage persistence as an effect, and the inspector.

## The project

```
examples/notes/
  index.html       the page: one stylesheet and one module script
  app.js           the entry: renders the layout and mounts the inspector
  routes.js        the route table
  router.js        the router the components share
  components.js    the views
  store.js         the state and the operations that change it
  styles.css       the global styles
  public/data/     the seed notes, served and copied as they are
```

`index.html` names the entry module and nothing else. The code imports packages by name, `zerolith` and `@zerolith/router`, and the command line finds them in `node_modules`, so there is no import map to keep, and a new file needs nothing but an import where it is used.

## Develop

From a clone set up as [CONTRIBUTING.md](../../CONTRIBUTING.md) describes:

```
npm run notes
```

This runs `zerolith dev examples/notes` and serves it at http://127.0.0.1:8080/. An edit reloads the page and keeps the search text, since `query` is a named signal; an edit to `styles.css` applies without a reload.

Press Alt+Shift+Z, or the launcher button in the corner, to open the inspector from `@zerolith/devtools`: every signal, computed value, and effect with its value and dependents, the mounted roots, and the diagnostics feed. The notes, the search text, and the filtered list are named signals, so the inspector lists them by name. The [dev tools guide](../../docs/guide/dev-tools.md) covers the rest, including the render and signal tracks in Chrome's Performance panel.

## Build

```
npm run notes:build
```

This runs `zerolith build examples/notes` and writes the production build to `examples/notes/dist`:

```
zerolith: built examples/notes into examples/notes/dist in 57 ms
  assets/index-39e0298e.css       0.79 kB
  assets/index-DMmvpp44.js       32.63 kB
  data/notes.json                 0.76 kB
  index.html                      0.51 kB
```

Every module, the packages included, is in one minified script with a content hash in its name, so a host can cache it for good; the stylesheet is minified the same way; `public/` is copied as it is; and `index.html` now loads the two hashed files. Templates are prepared at build time, so the template scanner is not in the script, and the inspector leaves the production build on its own.

## Preview

```
npm run notes:preview
```

This serves `dist` at http://127.0.0.1:4173/ as a static host would, to try the build before deploying it. Any static host, or the static file handler of any backend, serves the folder the same way; send paths that match no file to `index.html` so routes such as `/notes/routing` load directly.

## Tests

`test/notes.cli.test.ts` runs one flow in headless Chromium against `zerolith dev` and against the build under `zerolith preview`, through `npm run test:cli`. The files are plain JavaScript with JSDoc types, checked against the packages' type definitions by `npm run typecheck`.
