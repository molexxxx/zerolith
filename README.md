# zerolith

A standalone frontend framework: fine-grained signals, HTML templates that need no compiler, typed routing, and tooling that works wherever the app is served. It runs from an import map or a bundle with no second-class path, talks to any backend over plain HTTP, and keeps its documentation honest by executing every example in CI.

Status: pre-alpha, nothing published. This repository holds the runtime, the first-party packages, the policies the project commits to before its first release, and the research the design is based on. Integration with specific servers, zero-server included, is optional and separate; see `docs/decisions/0002-standalone-framework.md`.

## Layout

| Path | Contents |
| --- | --- |
| `packages/zerolith` | The core runtime: signals, `html` and `css` tags, rendering, hydration, diagnostics |
| `packages/*` | First-party packages under the `@zerolith/*` scope as they are added (router, forms, server, devtools, test, vite, cli) |
| `docs/policy` | Support window, release channels, versioning and deprecation rules |
| `docs/decisions` | Architecture decision records |
| `docs/research` | The design research the project started from |
| `examples/` | Applications built on the packages with no build step; `npm run serve` hosts them, and their tests run in `npm run check` |
| `docs/guide` | The guides; `npm run docs` builds the site into `site/` with the reference generated from the source and every example pulled from a test |

## Commands

Requires Node 24 or newer and npm 11.

| Command | What it does |
| --- | --- |
| `npm ci` | Install the dev toolchain (the runtime itself has no dependencies) |
| `npm run build` | Compile every package to `dist/` with `tsc` |
| `npm run typecheck` | Type-check sources, tests, and configs without emitting |
| `npm run lint` | Lint with oxlint |
| `npm test` | Run the Node test project |
| `npm run test:browser` | Run the browser test project in headless Chromium (first run: `npx playwright install chromium`) |
| `npm run check` | Build, typecheck, lint, run both test projects, check the size budget, and build the docs; this is what CI runs |
| `npm run sbom` | Emit a CycloneDX SBOM of the runtime dependency graph |
| `npm run docs` | Build the documentation site into `site/`; fails on an undocumented export, a missing example, or a broken link |
| `npm run serve` | Serve the repository on port 8080 for the examples and the built site at `/site/` (build first) |
| `npm run bench` | Run the keyed-table benchmark against a vanilla DOM baseline |

## Policies

- [Support window and channels](docs/policy/support.md)
- [Release process](docs/policy/releases.md)
- [Versioning and deprecation](docs/policy/versioning.md)
- [Governance](GOVERNANCE.md), [Security](SECURITY.md), [Contributing](CONTRIBUTING.md), [Code of conduct](CODE_OF_CONDUCT.md)

## License

Apache-2.0. See `LICENSE`.
