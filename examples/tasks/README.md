# Tasks

The Vite counterpart of the notes example: the same framework, bundled by Vite with hot replacement from `@zerolith/vite`, talking to a small API the dev server hosts. It shows the typed client generated from `openapi.json`, a form whose validation the API runs too, messages compiled from `messages/*.json` in English and German, the focus trap on a delete dialog, and the inspector.

Run it: `npm run build`, then `npx vite examples/tasks`, and open the address Vite prints. `npx vite build examples/tasks` writes the production bundle with every template prepared at build time, and `npm run size` builds it the same way and holds it to a budget.

Regenerate the contract and the messages after editing them:

```
npx zerolith-client examples/tasks/openapi.json --out examples/tasks/src/api.ts
npx zerolith-i18n examples/tasks/messages --out examples/tasks/src/messages
```

A test in `test/` starts the Vite server and drives the app in headless Chromium as part of `npm run check`.
