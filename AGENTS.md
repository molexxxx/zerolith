# Working on zerolith: guide for coding agents

This file is the always-on index for agents changing the zerolith repository itself. Keep it under 8 KB; link out for detail. An app built with zerolith does not use it: `zerolith new` writes the app its own `AGENTS.md`, and [docs/guide/agents.md](docs/guide/agents.md) covers setting up an agent for an app.

## What this is

A standalone frontend framework monorepo. `packages/zerolith` is the browser runtime (signals, `html` and `css` tagged templates, fine-grained DOM rendering, hydration, diagnostics). Other `packages/*` are first-party `@zerolith/*` packages. `crates/zerolith` is the Rust command line (`new`, `dev`, `serve`, `build`, `preview`, `skill`, `importmap`, `doctor`), shipped on npm as `@zerolith/cli` with one prebuilt platform package per target. The framework is backend-agnostic: it talks to any server over plain HTTP, and no runtime package may reference a specific server. The direction is in `docs/ROADMAP.md`, the guides in `docs/guide/`, and the rules the project has promised its users in `docs/policy/`.

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
- In templates, bind the signal, not its value. `${count}` is a live binding that updates in place; `${count.get()}` reads once when the template is created and never updates, and the runtime cannot warn you; `zerolith doctor` and the Vite plugin report it as `template_frozen_read`. Derived values are `${computed(() => item.get().name)}`, never `${item.get().name}`. The only correct uses of `.get()` inside a component body are inside `computed`, `effect`, `resource.params`, and event handlers.

## Definition of done

A change is done when it could ship in a release as it stands. Nothing is left for a later audit.

- **Specifications.** Code that implements a standard, such as URLs, HTTP, HTML, CSP, RFC 9457 problem details, MessageFormat 2, or OpenAPI, follows it, names the section in a doc comment where the behavior is not obvious, and tests the specification's own examples.
- **Tests first.** A fix starts with a test that fails without it. New behavior is tested with hostile and edge input as well as the expected case: malformed headers and URLs, CRLF, multibyte text, empty and very large input, paths that leave their folder, and text that reaches generated code. Parsers and code generators also get randomized-input tests.
- **Performance.** A change to signals, rendering, lists, or the router puts `npm run bench:compare` results in its commit message, and a slower result needs a reason. CI measures every push against `benchmarks/baseline`, which moves only in a commit that says why. The target is hand-written JavaScript's numbers on js-framework-benchmark, within the rules above.
- **Docs in step.** The commit that changes behavior updates everything that describes it: doc comments, guides, tutorial steps, the skill (`npm run skills`), the API reports (`npm run api`), `CHANGELOG.md`, and `docs/ROADMAP.md`, whose state table and checklists say what has shipped. Search the docs for every name you changed.
- **Seen working.** A visible change is checked in a real browser, in both themes, narrow and wide. A change to `zerolith new` or a template is checked by scaffolding each affected project and running its own `npm run check`.
- **Reviewed.** The diff is reviewed for correctness and security before it is committed, and what the review finds is fixed in the same change. Outside input, file deletion, generated code, and process or network boundaries get a second look.
- **Gates.** `npm run check` and the cargo checks pass, judged by each command's exit code rather than by reading its output.

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
| A guide or a guide example | `docs/guide/*.md`; examples are `#region` blocks of application code in `packages/*/test/examples/`, with their checks after the region, pulled in with `@include path#region`. Run `npm run skills` after changing a guide, since the Agent Skill's references are generated from the guides and a test fails while they are stale. Link another docs page by its file, such as `structure.md` or `../learn/state.md`, and what only the site serves, such as a diagnostic page or `llms.txt`, by its full address, so the link works on GitHub and on the site |
| A tutorial step | `docs/learn/*.md`; every file a step shows is a fixture under `packages/zerolith/test/fixtures/tutorial/<step>/`, laid out as the reader's project is, and `tutorial.example.browser.test.ts` runs each step |
| The docs site | `scripts/docs/`: `build.ts` writes `site/`, `layout.ts` the page shells, `home.ts` the home page, `playground.ts` the playground, `site.css` the styles |
| What shipped and what is next | `CHANGELOG.md` under Unreleased and `docs/ROADMAP.md`, in the commit that changes it |
| The Agent Skill | `skills/zerolith/SKILL.md` by hand; `skills/zerolith/references/` and the command line's copy in `crates/zerolith/templates/skill/` are generated by `npm run skills` |
| A new public API | An RFC issue first, opened with the RFC form (see GOVERNANCE.md); then `npm run api` updates the reports in `api/`, which the docs build holds the exports to |
| A policy change | `docs/policy/*.md`, by RFC |
| A release | `node scripts/version.ts <version>`, the version's `CHANGELOG.md` section, and a release pull request; `docs/policy/releases.md` has the steps |
| Brand assets, tokens, and visual rules | `brand/`; the rules are in `brand/README.md`, SVGs are the sources, and `npm run brand` renders the rasters |
