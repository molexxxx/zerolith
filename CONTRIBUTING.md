# Contributing

Thank you for considering a contribution. This page covers the mechanics; [GOVERNANCE.md](GOVERNANCE.md) covers how decisions are made.

## Setup

1. Install Node 24 or newer (Node 26 is the active LTS line).
2. `npm ci` installs the dev toolchain. The runtime itself has no dependencies.
3. `npx playwright install chromium` once, for the browser test project.
4. `npm run check` runs everything CI runs: build, typecheck, lint, and both test projects.

## What to work on

- Issues labeled `good first issue` are scoped and have a maintainer available to help.
- Bug fixes and documentation improvements can go straight to a pull request.
- Anything that changes the public API needs an RFC first; see GOVERNANCE.md.

## Pull requests

- One change per pull request. Dependency updates are their own pull requests and link the changelog of each updated package.
- Add or update tests for behavior changes. Runtime packages run their tests both in Node and in a real browser; if a change only makes sense in one, say so in the description.
- Every public export has a doc comment and an explicit type annotation (the build uses `isolatedDeclarations`).
- Keep the public surface small. If a feature can be a function in user code or a separate package, prefer that over a new export.

## Style

- American English everywhere: comments, docs, commit messages, identifiers.
- Regular dashes only; no em dashes. No horizontal rules in Markdown.
- Allman braces (opening brace on its own line), four-space indentation, as `.editorconfig` states.
- TypeScript under `erasableSyntaxOnly`: no enums, namespaces, parameter properties, or `const` assertions on declarations that the Node type stripper cannot erase.
- Relative imports use the `.js` extension so the compiled output runs unbundled.
- Comments explain non-obvious constraints only. No commented-out code, no planning language.

## Rust

The command line lives in `crates/zerolith`. `rust-toolchain.toml` pins the compiler for rustup users and CI; the crate also builds on the minimum version in `Cargo.toml`. Rust code follows default `rustfmt` formatting (the layout zero-core uses), `unsafe_code` is forbidden, and CI runs `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, and a release build.

## Commits

- Short imperative subject line, optional body explaining why.
- Dependency bumps name the package, the old and new version, the registry URL and the date the version was read.
- Do not add AI attribution trailers.

## License

By contributing you agree that your contributions are licensed under the Apache License 2.0, the project's license.
