# Tasks

A zerolith application in TypeScript with a backend: the typed client generated from `openapi.json`, a form whose validation the API runs too, messages compiled from `messages/*.json` in English and German, the focus trap on a delete dialog, and the inspector.

## The project

```
examples/tasks/
  index.html        the page: one stylesheet and one module script
  src/main.ts       the entry: loads the messages, waits for the router, renders, mounts the inspector
  src/              the routes, components, store, schema, and the generated client and messages
  styles.css        the global styles
  messages/         the English and German catalogs the messages compile from
  openapi.json      the API contract the typed client is generated from
  server.ts         the task API, as a fetch handler any server can mount
  vite.config.ts    develops on Vite, with the API mounted on its server
  preview.ts        serves the build with the API next to it
```

## Develop

From a clone set up as [CONTRIBUTING.md](../../CONTRIBUTING.md) describes:

```
npm run tasks
```

This runs Vite with `@zerolith/vite`, which mounts the API from `server.ts` on its dev server, and prints the address. An edit to a component swaps it in place and keeps the state of named signals. Press Alt+Shift+Z, or the launcher button in the corner, to open the inspector from `@zerolith/devtools`.

## Build

```
npm run tasks:build
```

This runs `zerolith build examples/tasks`, no Vite involved, and writes the production build to `examples/tasks/dist`:

```
zerolith: built examples/tasks into examples/tasks/dist in 65 ms
  assets/de-DWUa6-jV.js           1.69 kB
  assets/en-BR-GMg9l.js           1.62 kB
  assets/index-BcViqks6.js       45.39 kB
  assets/index-a01166d1.css       0.81 kB
  index.html                      0.57 kB
```

The application is one minified script, and each locale is a chunk of its own that loads when someone picks that language. Templates are prepared at build time, the inspector leaves the production build on its own, and `index.html` loads the hashed files. `npx vite build examples/tasks` writes an equivalent bundle through the plugin, and `npm run size` builds it that way and holds it to a budget.

## Preview

```
npm run tasks:preview
```

This serves `dist` at http://127.0.0.1:4173/ from a plain Node server, `preview.ts`, with the API from `server.ts` next to the files and `index.html` for every other path: the way any backend serves a built frontend. A backend in another language does the same with its own static file handler.

## Regenerate the contract and the messages

```
npx zerolith-client examples/tasks/openapi.json --out examples/tasks/src/api.ts
npx zerolith-i18n examples/tasks/messages --out examples/tasks/src/messages
```

## Tests

The tests in `test/` drive the app in headless Chromium through one flow: `tasks.test.ts` against the Vite dev server as part of `npm run check`, and `build.cli.test.ts` against the output of `zerolith build` served by `preview.ts`, through `npm run test:cli`.
