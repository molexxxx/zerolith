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
4. `npm run build` compiles every package from TypeScript into its `dist/` folder, which the examples and the tests load. It bundles no application.
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
| `npm run fullstack:api` | The fullstack example's backend: its API at http://127.0.0.1:3001/api/notes |
| `npm run fullstack` | `zerolith dev examples/fullstack`: the app under `/app/`, forwarding `/api` to that backend |
| `npm run fullstack:build` | `zerolith build examples/fullstack`: its production build for `/app/` in `examples/fullstack/dist` |
| `npm run fullstack:serve` | The backend serving the API and that build at http://127.0.0.1:3001/app/ |

Each example's README walks through what it shows and what the build writes.

## Layout

| Path | Contents |
| --- | --- |
| `packages/zerolith` | The core runtime: signals, `html` and `css` tags, rendering, hydration, diagnostics |
| `packages/*` | First-party packages under the `@zerolith/*` scope: router, forms, client, i18n, a11y, test, devtools, otel, vite, and cli, which ships the command line with one prebuilt platform package per target under `packages/cli/platforms` |
| `crates/zerolith` | The Rust command line: `new`, `dev`, `serve`, `build`, `preview`, `importmap`, `doctor`; published on npm as `@zerolith/cli` and on crates.io |
| `examples/` | Applications built on the packages; their tests run in `npm run check` |
| `docs/guide` | The guides; examples are pulled from tests with `@include` |
| `docs/learn` | The tutorial; every file it shows is a fixture under `packages/zerolith/test/fixtures/tutorial` that a test runs |
| `skills/` | Agent Skills; the references of `skills/zerolith` are generated from the guides |
| `docs/policy` | Support window, release channels, versioning and deprecation rules |
| `docs/ROADMAP.md` | What is shipped, next, and planned |
| `brand/` | The brand system; `brand/README.md` describes the rules |
| `benchmarks/` | The keyed-table benchmark against a vanilla DOM baseline |
| `scripts/` | The docs build, the size budget, the static server, the runner for this checkout's command line (`zerolith.ts`), the brand renderer, and the release tooling (`version.ts`, `release-notes.ts`, `platforms.ts`) |

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Compile every package to `dist/` with `tsc` |
| `npm run typecheck` | Type-check sources, tests, and configs without emitting |
| `npm run lint` | Lint with oxlint |
| `npm test` | Run the Node test project |
| `npm run test:browser` | Run the browser test project in headless Chromium |
| `npm run test:cli` | Build the examples with the `zerolith` binary and drive the output in headless Chromium; run `cargo build` first, which it finds in `target/release` or `target/debug` by date, or point `ZEROLITH_BINARY_PATH` at a binary. CI runs it in the Rust job |
| `npm run check` | Build, typecheck, lint, both test projects, the size budget, and the docs build; this is what CI runs |
| `npm run size` | Check the compressed size budget |
| `npm run docs` | Build the docs site into `site/`; fails on an undocumented export, a missing example, or a broken link. `ZEROLITH_DOCS_BASE=/zerolith/` builds it for a subpath, as GitHub Pages serves it |
| `npm run docs:serve` | Serve the built docs site on port 8081 |
| `npm run skills` | Regenerate the Agent Skill's references from the guides; a test fails while they are stale |
| `npm run api` | Accept a change to the public API by rewriting the reports in `api/`; the docs build fails while the API differs from them |
| `npm run bench` | Run the keyed-table benchmark |
| `npm run sbom` | Emit a CycloneDX SBOM of the runtime dependency graph |
| `npm run brand` | Render the brand PNG and ICO files from their SVG sources |
| `node scripts/version.ts <version>` | Set one version on every package, the platform packages, the ranges between them, and the crate, for a release commit; [releases.md](docs/policy/releases.md) has the rest of the steps |

## What to work on

- Issues labeled `good first issue` are scoped and have a maintainer available to help.
- Bug fixes and documentation improvements can go straight to a pull request.
- Anything that changes the public API needs an accepted RFC first.

## Pull requests

- One change per pull request. Dependency updates are their own pull requests and link the changelog of each updated package.
- Add or update tests for behavior changes. Runtime packages run their tests both in Node and in a real browser; if a change only makes sense in one, say so in the description.
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

The command line lives in `crates/zerolith`. `rust-toolchain.toml` pins the compiler for rustup users and CI; the crate also builds on the minimum version in `Cargo.toml`, 1.97, which the oxc crates require. Rust code follows default `rustfmt` formatting, `unsafe_code` is forbidden, and CI runs `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, and a release build, then builds the examples with that binary and drives them in a browser through `npm run test:cli`.

## Commits

- Short imperative subject line, optional body explaining why.
- Dependency bumps name the package, the old and new version, the registry URL, and the date the version was read.
- Do not add AI attribution trailers.

## License

By contributing you agree that your contributions are licensed under the Apache License 2.0, the project's license.
