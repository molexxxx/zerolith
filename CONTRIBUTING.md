# Contributing

Thank you for considering a contribution. This page covers the mechanics; [GOVERNANCE.md](GOVERNANCE.md) covers how decisions are made, and [AGENTS.md](AGENTS.md) holds the conventions in their shortest form.

## Where things go

- **Questions and ideas:** [GitHub Discussions](https://github.com/molexxxx/zerolith/discussions).
- **Bugs and documentation problems:** [issues](https://github.com/molexxxx/zerolith/issues/new/choose), using the templates.
- **A new public API or a change to one:** an RFC first, opened with the [RFC issue form](https://github.com/molexxxx/zerolith/issues/new?template=rfc.yml); see GOVERNANCE.md.
- **Vulnerabilities:** privately, as [SECURITY.md](SECURITY.md) describes. Never in a public issue.

## Setup

1. Install Node 24 or newer (Node 26 is the active LTS line) and npm 11.
2. `npm ci` installs the dev toolchain. The runtime itself has no dependencies.
3. `npx playwright install chromium` once, for the browser test project.
4. `npm run check` runs everything CI runs.

## Layout

| Path | Contents |
| --- | --- |
| `packages/zerolith` | The core runtime: signals, `html` and `css` tags, rendering, hydration, diagnostics |
| `packages/*` | First-party packages under the `@zerolith/*` scope: router, forms, client, i18n, a11y, test, devtools, otel, vite |
| `crates/zerolith` | The Rust command line: `new`, `dev`, `serve`, `build`, `importmap`, `doctor` |
| `examples/` | Applications built on the packages; their tests run in `npm run check` |
| `docs/guide` | The guides; examples are pulled from tests with `@include` |
| `docs/policy` | Support window, release channels, versioning and deprecation rules |
| `docs/ROADMAP.md` | What is shipped, next, and planned |
| `brand/` | The brand system; `brand/README.md` describes the rules |
| `benchmarks/` | The keyed-table benchmark against a vanilla DOM baseline |
| `scripts/` | The docs build, the size budget, the static server, and the brand renderer |

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Compile every package to `dist/` with `tsc` |
| `npm run typecheck` | Type-check sources, tests, and configs without emitting |
| `npm run lint` | Lint with oxlint |
| `npm test` | Run the Node test project |
| `npm run test:browser` | Run the browser test project in headless Chromium |
| `npm run check` | Build, typecheck, lint, both test projects, the size budget, and the docs build; this is what CI runs |
| `npm run size` | Check the compressed size budget |
| `npm run docs` | Build the docs site into `site/`; fails on an undocumented export, a missing example, or a broken link |
| `npm run docs:serve` | Serve the built docs site on port 8081 |
| `npm run serve` | Serve the repository on port 8080 for the examples (build first) |
| `npm run bench` | Run the keyed-table benchmark |
| `npm run sbom` | Emit a CycloneDX SBOM of the runtime dependency graph |
| `npm run brand` | Render the brand PNG and ICO files from their SVG sources |

## What to work on

- Issues labeled `good first issue` are scoped and have a maintainer available to help.
- Bug fixes and documentation improvements can go straight to a pull request.
- Anything that changes the public API needs an accepted RFC first.

## Pull requests

- One change per pull request. Dependency updates are their own pull requests and link the changelog of each updated package.
- Add or update tests for behavior changes. Runtime packages run their tests both in Node and in a real browser; if a change only makes sense in one, say so in the description.
- Docs examples live in tests, so a new example is a new `#region` in a `*.example.test.ts` file.
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

The command line lives in `crates/zerolith`. `rust-toolchain.toml` pins the compiler for rustup users and CI; the crate also builds on the minimum version in `Cargo.toml`, 1.97, which the oxc crates require. Rust code follows default `rustfmt` formatting, `unsafe_code` is forbidden, and CI runs `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, and a release build.

## Commits

- Short imperative subject line, optional body explaining why.
- Dependency bumps name the package, the old and new version, the registry URL, and the date the version was read.
- Do not add AI attribution trailers.

## License

By contributing you agree that your contributions are licensed under the Apache License 2.0, the project's license.
