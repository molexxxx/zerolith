# zerolith: guide for coding agents

This file is the always-on index for agents working in this repository. Keep it under 8 KB; link out for detail.

## What this is

A standalone frontend framework monorepo. `packages/zerolith` is the browser runtime (signals, `html` and `css` tagged templates, fine-grained DOM rendering, hydration, diagnostics). Other `packages/*` are first-party `@zerolith/*` packages. Rust code lives under `crates/` when the optional compiler and type generator are added. The framework is backend-agnostic: it talks to any server over plain HTTP, and no runtime package may reference a specific server (zero-server integration, if built, is an optional separate package). The design rationale is in `docs/research/` (read it as history, superseded where `docs/decisions/` says so), decisions in `docs/decisions/`, and the rules the project has promised its users in `docs/policy/`.

## Commands

- `npm ci` then `npx playwright install chromium` once.
- `npm run check` is the full gate (build, typecheck, lint, Node tests, browser tests). Run it before declaring work done.
- `npm test` runs the Node project only; `npm run test:browser` runs the Chromium project only.

## Hard rules

- Runtime packages never get a `dependencies`, `peerDependencies`, or `optionalDependencies` entry, and never an install script. A test fails the build if they do.
- Templates never evaluate strings as code; no `eval`, `new Function`, `innerHTML` with unmarked strings, or `setTimeout` with a string. The runtime must pass under `script-src 'self'` and Trusted Types.
- TypeScript is `erasableSyntaxOnly`: no `enum`, `namespace`, parameter properties, or decorators. Use `const` objects and union types.
- Every public export has an explicit type annotation and a doc comment (`isolatedDeclarations` is on).
- Relative imports end in `.js` even when the source file is `.ts`.
- One way to do each thing: do not add an alias, an overload, or a second syntax for an existing concept. Propose an RFC instead (see GOVERNANCE.md).
- Signals are `.get()` and `.set()`; there is no `.value`, no deep proxy, and no `setState`.
- In templates, bind the signal, not its value. `${count}` is a live binding that updates in place; `${count.get()}` reads once when the template is created and never updates, and nothing can warn you. Derived values are `${computed(() => item.get().name)}`, never `${item.get().name}`. The only correct uses of `.get()` inside a component body are inside `computed`, `effect`, `resource.params`, and event handlers.

## Style

- American English, regular dashes, no em dashes, no horizontal rules in Markdown.
- Allman braces and four-space indentation, in TypeScript, JSON, and Rust alike.
- Comments explain non-obvious constraints only; no narration, no planning language ("phase", "step 1"), no commented-out code.
- Commit subject: short, imperative. Dependency bumps are separate commits naming the package, versions, registry URL, and date.

## Versions

Never write a version number from memory. Read it from `https://registry.npmjs.org/<name>/latest` or `https://crates.io/api/v1/crates/<name>` and pin it exactly; `.npmrc` sets `save-exact`.

## Where things go

| Change | Location |
| --- | --- |
| Runtime behavior | `packages/zerolith/src`, with tests in `packages/zerolith/test` (`*.test.ts` run in Node, `*.browser.test.ts` run in Chromium) |
| A new public API | An RFC in `docs/rfcs/` first |
| A policy change | `docs/policy/*.md`, by RFC |
| A decision with lasting consequences | `docs/decisions/NNNN-title.md` |
