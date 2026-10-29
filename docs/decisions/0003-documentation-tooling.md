# 0003: Documentation tooling

Date: 2026-10-28. Status: accepted.

## Context

The project promises documentation that cannot drift: every reference page generated from the source and every example executed in CI. TypeScript 7.0.2 ships no JavaScript API, and TypeDoc 0.28.20 accepts TypeScript up to 6.0.x only, so TypeDoc would need a second, pinned TypeScript used for nothing else.

## Decisions

1. The API reference is extracted with `deno doc --json` from the Deno binary distributed on npm (`deno` 2.9.6, read from https://registry.npmjs.org/deno/latest on 2026-10-28). Deno has its own TypeScript front end, so the extraction does not depend on the TypeScript package at all. A root `deno.json` maps the workspace specifiers to the source entries and enables sloppy imports so the `.js` import convention of the sources resolves to `.ts` files. The generator refuses any undocumented export.
2. Executed examples live in test files under `packages/*/test/examples/` and are pulled into guides by `#region` markers with an `@include path#region` line. A missing file or region fails the build, and the examples run as ordinary tests in both the Node and browser projects.
3. Guides are Markdown with front matter, rendered by `marked` 18.1.2 (zero dependencies, read from https://registry.npmjs.org/marked/latest on 2026-10-28). It is a dev dependency of the build only; no runtime package depends on it.
4. Pages are wrapped by a shell written with zerolith and rendered through `zerolith/ssr`, so the site is a consumer of the framework's own server renderer. Rendered Markdown enters the shell through `unsafeHtml`, the one explicit raw-markup API.
5. Every page gets a Markdown twin, `llms.txt` indexes the twins, `llms-full.txt` concatenates them, and `api.json` is a manifest of every public symbol with its signature, doc, and source location. The diagnostics pages behind `https://zerolith.dev/e/<code>` are generated from the runtime's own catalog.
6. The build checks every internal link against the pages it produced and fails on a broken one. `npm run docs` is part of `npm run check`, so CI fails when documentation and code disagree.

## Consequences

- Adding an export without a doc comment fails CI.
- Changing an API breaks the example tests before it can break the docs.
- The site is static HTML with no client JavaScript until search or interactive demos need it; hydration is a later step.
