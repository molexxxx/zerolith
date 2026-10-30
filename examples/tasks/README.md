# Tasks

The bundled counterpart of the notes example: the same framework, served by Vite with hot replacement from `@zerolith/vite` while developing and bundled by `zerolith build` or `vite build` for production, talking to a small API in `server.ts` that the dev server hosts. It shows the typed client generated from `openapi.json`, a form whose validation the API runs too, messages compiled from `messages/*.json` in English and German, the focus trap on a delete dialog, and the inspector from `@zerolith/devtools`, which Alt+Shift+Z or the launcher button in the corner opens while developing; the production bundle leaves it out.

Run it: `npm run build`, then `npx vite examples/tasks`, and open the address Vite prints. For the production bundle, `cargo build --release` and then `target/release/zerolith build examples/tasks` write it to `examples/tasks/dist` with every template prepared at build time, as `npx vite build examples/tasks` does; `npm run size` builds it with Vite and holds it to a budget.

Regenerate the contract and the messages after editing them:

```
npx zerolith-client examples/tasks/openapi.json --out examples/tasks/src/api.ts
npx zerolith-i18n examples/tasks/messages --out examples/tasks/src/messages
```

The tests in `test/` drive the app in headless Chromium through one flow: `tasks.test.ts` against the Vite dev server as part of `npm run check`, and `build.cli.test.ts` against the output of `zerolith build`, served by a plain Node server with the API from `server.ts` next to it, through `npm run test:cli`.
