# Roadmap

Where zerolith stands, what comes next, and where it is headed. There are no dates: items move when they are ready, and anything that changes the public API goes through an RFC first, as [GOVERNANCE.md](../GOVERNANCE.md) describes.

## Shipped

Everything here runs and is tested in this repository, and the first alpha is published under the `alpha` dist-tag on npm and on crates.io.

- **Runtime.** Signals (`signal`, `computed`, `effect`, `batch`, `resource`), `html` and `css` tagged templates with keyed lists and conditions, fine-grained rendering, hydration, server rendering, custom elements with attributes and properties as signals, JSX as an alternative spelling of `html`, and coded diagnostics with a page per code. The runtime has no dependencies and runs under a strict Content Security Policy and Trusted Types.
- **Packages.** Router, forms, typed client generated from OpenAPI, i18n with compiled MessageFormat 2 catalogs, accessibility primitives, test helpers, dev tools, OpenTelemetry spans, and the Vite plugin.
- **Tooling.** The Rust command line (`new`, `dev`, `serve`, `build`, `importmap`, `doctor`), published on npm as `@zerolith/cli` with a prebuilt binary per platform and on crates.io, the template prepare pass and transform-time warnings in the Vite plugin, a size budget and a benchmark harness enforced in CI, and a CycloneDX SBOM.
- **Docs.** Guides whose examples are tests, a reference generated from the source, search, and a Markdown twin of every page indexed by `llms.txt` and `llms-full.txt`.
- **Project.** Governance, a security policy, the support window and release channels, the RFC process, OpenSSF Scorecard, SHA-pinned workflows, and the brand system.

## Next

- Freeze the API of the core, templates, and router for 1.0.
- Trusted publishing for every package and the crate, then the canary channel.
- The template prepare pass in the Rust command line, so `zerolith build` emits the same modules the Vite plugin does.
- Run the template lint from the Rust command line, so `zerolith doctor` reports the same warnings as the Vite plugin.

## Planned

### Real time

- Signals the server can push over Server-Sent Events, resuming from `Last-Event-ID` after a reconnect.
- WebSocket for two-way and binary traffic, and WebTransport behind feature detection.

### Coding agents

- An MCP server for the docs, and one inside the dev server that exposes the reactive graph with a read-only mode.
- Agent Skills, and a public eval suite that measures whether the in-repo context helps agents, published with its method.

### Docs and editors

- A versioned API manifest that feeds the agent index and editor tooling.
- A VS Code extension for templates, generated from that manifest.
- Type-checked code samples on every docs page.

### Tooling

- `zerolith migrate`, with codemods between versions.
- An entry in js-framework-benchmark. Performance claims appear only with a reproducible benchmark beside them.

### Enterprise readiness

- An accessibility conformance report for the first-party components.
- The latest, canary, and experimental release channels running as [the support policy](policy/support.md) describes.

### Ecosystem and community

- An adapter contract and a directory for third-party packages.
- A showcase of applications built with zerolith.
- A second maintainer with release rights, and a contributor ladder.

## Not planned

- **A required compiler.** The bundler and the command line optimize; plain files always run.
- **WebRTC in the core.** A separate package may follow later.
- **Coupling to a particular backend.** zerolith talks to any server over plain HTTP; an integration with a specific server is a separate package, never a requirement of the core.
