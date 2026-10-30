# Notes

A small application that uses every part of zerolith and the router with no build step: a keyed list with search, a note page with a URL parameter, a native form with constraint validation and `ref` focus, seed data loaded through `resource`, scoped `css`, `when` for loading, error, and empty states, and localStorage persistence as an effect.

Run it: `npm run build`, then `npm run serve`, then open http://127.0.0.1:8080/examples/notes/. The import map in `index.html` points at the built packages.

Press Alt+Shift+Z, or the launcher button in the corner, to open the inspector from `@zerolith/devtools`: every signal, computed value, and effect with its value and dependents, the mounted roots, and the diagnostics feed. The notes, the search text, and the filtered list are named signals, so the inspector lists them by name. The [dev tools guide](../../docs/guide/dev-tools.md) covers the rest, including the render and signal tracks in Chrome's Performance panel.

The files are plain JavaScript with JSDoc types, checked against the packages' type definitions by `npm run typecheck`. A Playwright test in `test/` drives the app in headless Chromium as part of `npm run check`.
