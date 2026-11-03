# Contributing

Thank you for considering a contribution. This page covers the mechanics; [GOVERNANCE.md](GOVERNANCE.md) covers how decisions are made, and [AGENTS.md](AGENTS.md) holds the conventions in their shortest form.

## Where things go

- **Questions and ideas:** [GitHub Discussions](https://github.com/molexxxx/zerolith/discussions).
- **Bugs and documentation problems:** [issues](https://github.com/molexxxx/zerolith/issues/new/choose), using the templates.
- **A new public API or a change to one:** an RFC first, opened with the [RFC issue form](https://github.com/molexxxx/zerolith/issues/new?template=rfc.yml); see GOVERNANCE.md.
- **Vulnerabilities:** privately, as [SECURITY.md](SECURITY.md) describes. Never in a public issue.

## Setup

1. Install Node 24 or newer (Node 26 is the active LTS line) and npm 11, and Rust through rustup for the command line.
2. `npm ci` installs the dev toolchain. The runtime itself has no dependencies.
3. `npx playwright install chromium` once, for the browser test projects.
4. `npm run build` compiles every package from TypeScript into its `dist/` folder, the readable build the examples and the tests load, and writes each browser package's production build, minified one module at a time with source maps, into `dist/production/`. It bundles no application.
5. `cargo build --release` builds the `zerolith` command line into `target/release`, which the examples run on.
6. `npm run check` runs everything the Node jobs in CI run, and `npm run test:cli` what the Rust job adds.

## Run the examples

Each example runs on this checkout's command line through a script, which finds the newer of `target/release` and `target/debug`:

| Command | What it does |
| --- | --- |
| `npm run notes` | `zerolith dev examples/notes`: the notes example with live reload at http://127.0.0.1:8080/ |
| `npm run notes:build` | `zerolith build examples/notes`: its production build in `examples/notes/dist` |
| `npm run notes:preview` | `zerolith preview examples/notes`: serves that build at http://127.0.0.1:4173/ |
| `npm run tasks` | The tasks example on Vite, with its API mounted on the dev server |
| `npm run tasks:build` | `zerolith build examples/tasks`: its production build in `examples/tasks/dist` |
| `npm run tasks:preview` | Serves that build with the API next to it, as a backend would, at http://127.0.0.1:4173/ |
| `npm run fullstack:api` | The fullstack example's backend in watch mode: its API at http://127.0.0.1:3001/api/ |
| `npm run fullstack` | `zerolith dev examples/fullstack`: the app under `/app/`, forwarding `/api` to that backend |
| `npm run fullstack:build` | `zerolith build examples/fullstack`: its production build for `/app/` in `examples/fullstack/dist` |
| `npm run fullstack:serve` | The backend serving the API and that build at http://127.0.0.1:3001/app/ |

Each example's README walks through what it shows and what the build writes.

## Layout

| Path | Contents |
| --- | --- |
| `packages/zerolith` | The core runtime: signals, `html` and `css` tags, rendering, hydration, diagnostics |
| `packages/*` | First-party packages under the `@zerolith/*` scope: router, forms, client, i18n, a11y, test, devtools, otel, vite, and cli, which ships the command line with one prebuilt platform package per target under `packages/cli/platforms` |
| `crates/zerolith` | The Rust command line: `new`, `dev`, `serve`, `build`, `preview`, `skill`, `importmap`, `doctor`; published on npm as `@zerolith/cli` and on crates.io |
| `examples/` | Applications built on the packages; their tests run in `npm run check` |
| `docs/guide` | The guides; examples are pulled from tests with `@include` |
| `docs/learn` | The tutorial; every file it shows is a fixture under `packages/zerolith/test/fixtures/tutorial` that a test runs |
| `skills/` | Agent Skills; the references of `skills/zerolith` are generated from the guides |
| `docs/policy` | Support window, release channels, versioning and deprecation rules |
| `docs/ROADMAP.md` | What is shipped, next, and planned |
| `brand/` | The brand system; `brand/README.md` describes the rules |
| `benchmarks/` | The keyed-table benchmark against a vanilla DOM baseline |
| `scripts/` | The docs build, the packages' production build (`production.ts`), the size budget, the static server, the runner for this checkout's command line (`zerolith.ts`), the brand renderer, and the release tooling (`version.ts`, `built-versions.ts`, `release-notes.ts`, `platforms.ts`) |

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Compile every package to `dist/` with `tsc`, and write the browser packages' minified production builds to `dist/production/` with `scripts/production.ts` |
| `npm run typecheck` | Type-check sources, tests, and configs without emitting |
| `npm run lint` | Lint with oxlint |
| `npm test` | Run the Node test project |
| `npm run test:browser` | Run the browser test project in headless Chromium |
| `npm run test:coverage` | Run both test projects with coverage, and fail when a package's lines, statements, functions, or branches fall below its floor in `vitest.config.ts`, set within a point or two items of its coverage; raise a package's floor when its coverage rises. The command line's launcher in `packages/cli` is left out, since its tests run against the built binary |
| `npm run test:cli` | Build the examples with the `zerolith` binary and drive the output in headless Chromium; run `cargo build` first, which it finds in `target/release` or `target/debug` by date, or point `ZEROLITH_BINARY_PATH` at a binary. CI runs it in the Rust job |
| `npm run scaffolds` | Write every project `zerolith new` offers, each template on the command line, buildless, and on Vite, one without the inspector, and each example, outside the checkout; install each against packages packed from the checkout and run its own `npm run check`. Needs `ZEROLITH_BINARY_PATH`; names such as `tsx-vite` limit the run. CI runs it in the Rust job |
| `npm run check` | Build, typecheck, lint, both test projects with the coverage floor, the size budget, and the docs build; this is what CI runs |
| `npm run size` | Check the compressed size budgets: the core bundled, the core's modules as an import map loads them, and a built example |
| `npm run docs` | Build the docs site into `site/`; fails on an undocumented export, a missing example, or a broken link. `ZEROLITH_DOCS_BASE=/docs/` builds it for a subpath and `ZEROLITH_DOCS_URL` names its address; the docs workflow passes both from the Pages configuration |
| `npm run docs:serve` | Serve the built docs site on port 8081 |
| `npm run skills` | Regenerate the Agent Skill's references from the guides, and the copy of the whole skill the command line builds in; a test fails while either is stale |
| `npm run api` | Accept a change to the public API by rewriting the reports in `api/`; the docs build fails while the API differs from them |
| `npm run bench` | Run the keyed-table benchmark against the hand-written page, both in one renderer process |
| `npm run bench:collect` | Write one js-framework-benchmark run into `benchmarks/results/` from the benchmark's result files, with zerolith's release before from the folder `zerolith-previous` when `--previous` names it, or to the file `--out` names: `npm run bench:collect -- <checkout>/webdriver-ts/results --date <YYYY-MM-DD> --zerolith <version> --method <text> --machine <text>` |
| `npm run bench:compare` | Build the core at a base commit, HEAD unless `--base` names another, and time each operation on it and on the working tree's build side by side in one page, alternating sample by sample, with the builds trading places in a new page halfway; fails when the change is more than `--threshold` percent slower overall, 5 by default, or `--operation-threshold` percent in one operation, 15 by default, in a pass and in the pass that confirms it. Run `npm run build` first. CI runs it on every push and pull request against `--base baseline`, the commit `benchmarks/baseline` names |
| `npm run bench:report` | Write the results section of `benchmarks/README.md` from the runs in `benchmarks/results/`, the newest release first; `--add <file>` first takes in a run collected elsewhere, checked field by field, `--pin <version>` moves the js-framework-benchmark entry to a later release, and `benchmarks/baseline` with it unless the baseline names a commit the release does not hold, and `--check` alone fails when the section is behind the runs |
| `npm run sbom` | Emit a CycloneDX SBOM of the runtime dependency graph |
| `npm run brand` | Render the brand PNG and ICO files from their SVG sources |
| `node scripts/version.ts <version>` | Set one version on every package, the platform packages, the ranges between them, the packages' version constants, and the crate, for a release commit; [releases.md](docs/policy/releases.md) has the rest of the steps |

## What to work on

- Issues labeled `good first issue` are scoped and have a maintainer available to help.
- Bug fixes and documentation improvements can go straight to a pull request.
- Anything that changes the public API needs an accepted RFC first.

## Pull requests

- Meet the definition of done in [AGENTS.md](AGENTS.md#definition-of-done): specifications followed and tested from their examples, a failing test before a fix, hostile and edge input covered, `npm run bench:compare` results for a change to signals, rendering, lists, or the router, every doc that describes the change updated in the same pull request, visible changes checked in a browser, and the diff reviewed before it is pushed.
- One change per pull request. Dependency updates are their own pull requests and link the changelog of each updated package.
- Add or update tests for behavior changes. Runtime packages run their tests both in Node and in a real browser; if a change only makes sense in one, say so in the description.
- Links in the guides and the tutorial work on GitHub and on the site: link another docs page by its file, such as `structure.md` or `../learn/state.md`, and what only the site serves, such as a diagnostic page, a reference page, or `llms.txt`, by its full address under https://zerolith.dev/. The docs build turns both into site paths and refuses a root-relative link, and a test checks that every relative link in the repository's Markdown points at a file.
- Docs examples live in tests, so a new example is a new `#region` in a `*.example.test.ts` file. The region is the code an application would contain: the docs build adds the imports it uses and refuses an `expect` inside it, so the checks go after the region, or between two parts of a region opened twice. `@include path#region test` shows a test as a test, and `excerpt` shows generated code verbatim.
- Every public export has a doc comment and an explicit type annotation (the build uses `isolatedDeclarations`).
- Prefer a function in user code or a separate package over a new export in the core.

## Style

- American English everywhere: comments, docs, commit messages, identifiers.
- Regular dashes only; no em dashes. No horizontal rules in Markdown.
- Allman braces (opening brace on its own line), four-space indentation, as `.editorconfig` states.
- TypeScript under `erasableSyntaxOnly`: no enums, namespaces, parameter properties, or decorators.
- Relative imports use the `.js` extension so the compiled output runs unbundled.
- Comments explain non-obvious constraints only. No commented-out code, no planning language.

## Rust

The command line lives in `crates/zerolith`. `rust-toolchain.toml` pins the compiler for rustup users and CI; the crate also builds on the minimum version in `Cargo.toml`, 1.97, which the oxc crates require. Rust code follows default `rustfmt` formatting, `unsafe_code` is forbidden, and CI runs `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` on Linux and Windows, the RustSec advisory check through cargo-deny, and a release build, then builds the examples with that binary and drives them in a browser through `npm run test:cli`.

## Commits

- Short imperative subject line, optional body explaining why.
- Dependency bumps name the package, the old and new version, the registry URL, and the date the version was read.
- Do not add AI attribution trailers.

## License

By contributing you agree that your contributions are licensed under the Apache License 2.0, the project's license.
