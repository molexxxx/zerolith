# zerolith: guide for coding agents

This file is the always-on index for agents working in this repository. Keep it under 8 KB; link out for detail.

## What this is

A standalone frontend framework monorepo. `packages/zerolith` is the browser runtime (signals, `html` and `css` tagged templates, fine-grained DOM rendering, hydration, diagnostics). Other `packages/*` are first-party `@zerolith/*` packages. `crates/zerolith` is the Rust command line (`new`, `dev`, `serve`, `build`, `importmap`, `doctor`), shipped on npm as `@zerolith/cli` with one prebuilt platform package per target. The framework is backend-agnostic: it talks to any server over plain HTTP, and no runtime package may reference a specific server. The direction is in `docs/ROADMAP.md`, the guides in `docs/guide/`, and the rules the project has promised its users in `docs/policy/`.

## Commands

- `npm ci` then `npx playwright install chromium` once.
- `npm run check` is the full gate (build, typecheck, lint, Node and browser tests, the size budget, and the docs build). Run it before declaring work done.
- Under `crates/`, run `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test`.
- `npm test` runs the Node project only; `npm run test:browser` runs the Chromium project only.

## Hard rules

- The core `zerolith` package has no `dependencies`, `peerDependencies`, or `optionalDependencies`, and no package has an install script; a test fails the build if they appear. Other packages list zerolith packages as peers, and the only third-party peers are Vite for `@zerolith/vite` and `@opentelemetry/api` for `@zerolith/otel`. A new one needs an RFC.
- Templates never evaluate strings as code; no `eval`, `new Function`, `innerHTML` with unmarked strings, or `setTimeout` with a string. The runtime must pass under `script-src 'self'` and Trusted Types.
- TypeScript is `erasableSyntaxOnly`: no `enum`, `namespace`, parameter properties, or decorators. Use `const` objects and union types.
- Every public export has an explicit type annotation and a doc comment (`isolatedDeclarations` is on).
- Relative imports end in `.js` even when the source file is `.ts`.
- One way to do each thing: do not add an alias, an overload, or a second syntax for an existing concept. Propose an RFC instead (see GOVERNANCE.md). JSX in `.jsx` and `.tsx` files is not a second syntax: the build lowers it to the same `html` calls, components stay functions, and `prop:`, `on:`, and `bool:` select the binding forms; the buildless form stays `html`.
- Signals are `.get()` and `.set()`; there is no `.value`, no deep proxy, and no `setState`.
- In templates, bind the signal, not its value. `${count}` is a live binding that updates in place; `${count.get()}` reads once when the template is created and never updates, and nothing can warn you. Derived values are `${computed(() => item.get().name)}`, never `${item.get().name}`. The only correct uses of `.get()` inside a component body are inside `computed`, `effect`, `resource.params`, and event handlers.

## Style

- American English, regular dashes, no em dashes, no horizontal rules in Markdown.
- Allman braces and four-space indentation in TypeScript and JSON. Rust follows default `rustfmt`.
- Comments explain non-obvious constraints only; no narration, no planning language ("phase", "step 1"), no commented-out code.
- Commit subject: short, imperative. Dependency bumps are separate commits naming the package, versions, registry URL, and date.

## Versions

Never write a version number from memory. Read it from `https://registry.npmjs.org/<name>/latest` or `https://crates.io/api/v1/crates/<name>` and pin it exactly; `.npmrc` sets `save-exact`.

## Where things go

| Change | Location |
| --- | --- |
| Runtime behavior | `packages/zerolith/src`, with tests in `packages/zerolith/test` (`*.test.ts` run in Node, `*.browser.test.ts` run in Chromium) |
| The command line | `crates/zerolith/src`, with tests beside the code |
| A guide or a guide example | `docs/guide/*.md`; examples are `#region` blocks in `packages/*/test/examples/`, pulled in with `@include path#region` |
| A new public API | An RFC issue first, opened with the RFC form (see GOVERNANCE.md) |
| A policy change | `docs/policy/*.md`, by RFC |
| Brand assets, tokens, and visual rules | `brand/`; the rules are in `brand/README.md`, SVGs are the sources, and `npm run brand` renders the rasters |
