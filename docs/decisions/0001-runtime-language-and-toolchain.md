# 0001: Runtime language, signal API, name, and toolchain

Date: 2026-10-28. Status: accepted; amended 2026-10-29 to remove the pairing with a specific server, which ADR 0002 rules out.

## Context

The project replaces zero-query with a ground-up, standalone framework that works with any backend over plain HTTP. The founding design research of 2026-10-28 (not published; see `docs/ROADMAP.md`) compared a full Rust/WASM front end, a JavaScript/TypeScript runtime with a Rust toolchain, and a hybrid, and left four decisions to the project lead.

## Decisions

1. The browser runtime is written in TypeScript under `erasableSyntaxOnly` and `verbatimModuleSyntax`, compiled by `tsc` to standards-only `.js` plus `.d.ts`. Rust is used for the toolchain, the command line, the optional compiler, and type generation; it is not used in the browser except through opt-in WASM modules, and the framework does not depend on any server being written in it. Reasons: the benchmark evidence in the research (Rust frameworks at 44 to 115 KB compressed and 215 to 537 ms first paint versus 4.5 KB and 53.5 ms for the best signal runtime), the pre-1.0 status of every Rust front-end framework, the Chrome-only debugging story, and the hiring pool.
2. Signals expose `.get()` and `.set()`, matching the TC39 Signals proposal's `Signal.State` and `Signal.Computed` shape, so a native implementation can be substituted if the proposal ships.
3. The name is `zerolith`, with the core package `zerolith` and first-party packages under `@zerolith/*`. It keeps the zero family visible without the bare word (which is Rocicorp's in mindshare) or a hyphenated compound (squat-prone). npm, crates.io, GitHub, and `.dev` availability were verified on 2026-10-28; trademark status is unverified.
4. The license is Apache-2.0, for its explicit patent grant and its acceptance in enterprise review, and because the projects this one is most likely to be used alongside ship under it.

## Toolchain pins and the reasons for them

Versions read from the registries on 2026-10-28.

| Tool | Version | Role | Note |
| --- | --- | --- | --- |
| TypeScript | 7.0.2 | `tsc` type checking and `.d.ts` emission | The Go port; it has no JavaScript compiler API, so no tool in this repository may depend on that API |
| oxlint | 1.90.0 | Linting | Parses TypeScript natively; chosen because typescript-eslint 8.72.1 requires TypeScript below 6.1 |
| Vitest | 5.0.5 | Tests, Node project and browser project | Transforms TypeScript without the TypeScript API |
| @vitest/browser-playwright | 5.0.5 | Browser test provider | Headless Chromium for CSP, Trusted Types, and DOM tests |
| Playwright | 1.64.1 | Browser automation | |
| @types/node | 26.6.6 | Types for tooling and tests | |
| Node | 24 and 26 in CI, `>=24` in engines | Node 26 entered LTS on 2026-10-28; Node 24 entered maintenance on 2026-10-20 | Type stripping is stable on both, so tooling scripts can run unbundled |

TypeDoc 0.28.20 requires TypeScript 6.0.x; the API reference tool is chosen when the docs site is built and may be `deno doc` or TypeDoc on a pinned TypeScript 6.0.3 used only for that step.

## Consequences

- All runtime packages carry no `dependencies`, no `peerDependencies`, and no install scripts; a test enforces this.
- Relative imports in runtime packages use `.js` extensions and the output runs unbundled from an import map.
- `isolatedDeclarations` is on, so every public export carries an explicit type annotation; this also makes the API manifest derivable without type checking.
