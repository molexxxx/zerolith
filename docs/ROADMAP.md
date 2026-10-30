# Roadmap

Where zerolith stands, what remains before 1.0, and what follows it. There are no dates: items move when they are ready, and anything that changes the public API goes through an RFC first, as [GOVERNANCE.md](../GOVERNANCE.md) describes. A checked item is on `main` and tested; an unchecked item is planned. The [changelog](../CHANGELOG.md) records what each release contains.

## Where it stands

`0.1.0-alpha.2` was published on 2026-10-30, after `0.1.0-alpha.1` on 2026-10-29: the core, ten first-party packages, and the command line with prebuilt binaries, on npm under the `alpha` dist-tag with provenance, on crates.io, and as a [GitHub release](https://github.com/molexxxx/zerolith/releases) with its SBOM. The [docs site](https://molexxxx.github.io/zerolith/) is published from the same commit. The API is not frozen, and minor versions may change it until 1.0.

| Area | State |
| --- | --- |
| Runtime | Feature-complete for 1.0; the API freeze is next |
| Router, forms, typed client | Feature-complete for 1.0; real-time data follows 1.0 |
| Build path | Template preparation with static hoisting, the split check, and the template lint, in the Vite plugin and the command line alike |
| Command line | Published with prebuilt binaries for six targets; develops, bundles, and previews a project on its own; the starter project and a proxy to backends are next |
| Dev tools and testing | Shipped; the browser extension adapter remains |
| Accessibility, i18n, observability | Shipped; the conformance report and the MessageFormat 1 import remain |
| Docs | Published to GitHub Pages by each release; the project domain is not registered yet |
| Coding agents | In-repo context shipped; MCP servers, Skills, and evals remain |
| Adoption | No production application yet; the first migration is next |
| Project and supply chain | Policies, provenance, GitHub releases, and npm trusted publishers in place; canaries remain |

## Next

In order:

1. A starter project that `zerolith new` writes in the brand style, with `dev`, `build`, and `preview` on the command line, dependencies installed in the same step, and a README covering deployment and when to add Vite.
2. A proxy from `zerolith dev` to any backend, a base path for it, and example projects for common backend layouts. The Vite plugin stays an option for projects already on Vite.
3. A guide to building and serving.
4. Publish the next release through npm trusted publishing alone, which every npm package now has; then start the canary channel.
5. Register the project domain and move the docs there from GitHub Pages. Every diagnostic links to its page on the docs site, so the address has to be permanent before 1.0.
6. Migrate the first production site onto zerolith.
7. Review the core, templates, and router API through an RFC and freeze it for 1.0.

## 1.0

1.0 ships when all of these hold. The API of the core, templates, and router is then supported for 24 months under the [support policy](policy/support.md).

- [ ] The API of the core, templates, and router is frozen through an RFC.
- [ ] The docs site is live at the project's own domain, built with zerolith itself, and every diagnostic code's page resolves there.
- [ ] A production site runs on zerolith, served buildless with an import map and integrity hashes, with a Lighthouse budget enforced in CI.
- [ ] A keyed entry is submitted to js-framework-benchmark, with the core inside its 10 kB compressed budget.
- [ ] Every npm package publishes through trusted publishing with provenance, and the canary channel runs.
- [x] The test suite passes unbundled under a CSP without `unsafe-eval` and bundled with Vite.
- [x] Every docs example is a test, so a broken example fails CI.
- [x] Every public export is documented; the docs build fails on an undocumented one.

## Runtime

- [x] Signals: `signal`, `computed`, `effect`, `batch`, `untracked`, `scope`, and `resource`, on the TC39 vocabulary.
- [x] `html` and `css` tagged templates, keyed `each`, `when`, refs, and scoped styles.
- [x] Fine-grained rendering with no virtual DOM, under Trusted Types and a strict CSP.
- [x] Server rendering to strings and hydration with mismatch repair and reporting.
- [x] Coded diagnostics with a cause, a fix, and a page per code.
- [x] Custom elements with attributes and properties as signals (`zerolith/element`).
- [x] JSX as an alternative spelling of `html`.
- [x] Mounting by element or CSS selector.
- [x] Templates prepared ahead of time by a build tool, with the scanner left out of the bundle.
- [ ] Streaming server rendering.
- [ ] Islands as a public API: server-rendered pages that hydrate only their interactive parts. The docs search already runs this way.
- [ ] Form-associated custom elements through `ElementInternals`.
- [ ] Attribute checking inside `html` templates through template literal types, as a bounded experiment. JSX already checks attributes.

## Router

- [x] A typed route table with lazy views, loaders, head metadata, and scroll restoration.
- [x] A server entry with head rendering and embedded route data that the browser reuses.
- [x] An `observe` hook for navigation start, commit, and error.
- [ ] Generated route declarations for large route tables, where inference slows type checking.
- [ ] View-stack routing for desktop applications: history, kept-alive views, and full-screen views.

## Data and forms

- [x] `@zerolith/client`: types and a route table generated from OpenAPI 3.x, checked calls, problems as errors, and a message port transport.
- [x] `@zerolith/forms`: native forms enhanced with `fetch`, RFC 9457 problems with a `fields` map, and Standard Schema validation shared with the server.
- [ ] An in-process transport that calls a handler directly, for tests.
- [ ] Signals the server pushes over Server-Sent Events, resuming from `Last-Event-ID` after a reconnect.
- [ ] WebSocket for two-way and binary traffic, and WebTransport behind feature detection.

## Build path

See the [Vite guide](guide/vite.md).

- [x] `@zerolith/vite`: JSX lowering, hot replacement that keeps named signals, development warnings, and a production check against development modules.
- [x] The template prepare pass in `vite build` and in `zerolith build`, held to one output by a shared fixture.
- [x] A size budget for the core and for a built example, enforced in CI.
- [x] Static hoisting of templates with no bindings.
- [x] A check that fails a client build when a lazy route view or a compiled locale is also imported statically, which would merge it into the importing chunk, in `vite build` and in `zerolith build`.
- [ ] Adapters for Rolldown, esbuild, Rspack, and webpack, each as it is asked for.

## Command line

See the [command line guide](guide/command-line.md).

- [x] `new`, `dev`, `serve`, `build`, `preview`, `importmap`, and `doctor`.
- [x] `dev` and `build` serve and write TypeScript and JSX through oxc with no other tool.
- [x] `@zerolith/cli` on npm with prebuilt binaries for Linux, macOS, and Windows on x64 and arm64, and the crate on crates.io.
- [x] `doctor` reports the same template warnings as the Vite plugin.
- [x] `build` bundles with Rolldown and lightningcss compiled in: minified chunks with hashed names, lazy routes and locales split out, one stylesheet lowered for the supported browsers, assets copied under hashed names, a base path, and the same passes as the Vite plugin; `--unbundled` keeps the import map output.
- [x] `dev` resolves packages from `node_modules` with the build's resolver, so a page needs no import map, and serves stylesheets, JSON, and other files imported from code, `PUBLIC_` variables from `.env` files, and the public folder, as `build` does.
- [x] `preview` serves a build's output as a static host would.
- [ ] A proxy from `dev` to a backend, and a base path for `dev`.
- [ ] `zerolith migrate`, with codemods between versions.
- [ ] A musl binary for Alpine and other musl distributions.

## Dev tools and testing

- [x] The in-page inspector: component tree, signal graph, route state, and diagnostics, from any host including `file://`.
- [x] Render and signal tracks in Chrome's Performance panel.
- [x] Chrome DevTools workspace support from `zerolith dev`.
- [x] `@zerolith/test`: mount with cleanup, settle, hydration mismatches, and accessibility issues.
- [ ] A thin browser extension panel over the same hook.
- [ ] The inspector verified in a packaged Electron build.

## Accessibility, i18n, and observability

- [x] `@zerolith/a11y`: focus trap, roving tabindex, live announcer, focus origin, visually hidden styles, and media query signals.
- [x] Warnings for images without alt text, unnamed buttons, and untitled frames.
- [x] `@zerolith/i18n`: locale negotiation, direction, `Intl` formatters, and MessageFormat 2 catalogs compiled to typed modules.
- [x] `@zerolith/otel`: navigation, hydration, and request spans through `@opentelemetry/api`.
- [ ] An accessibility audit of the rendered page while developing.
- [ ] An import path for existing MessageFormat 1 catalogs.
- [ ] An accessibility conformance report for the first-party packages.

## Docs

- [x] Guides whose examples are tests, a reference generated from the source, and search built with zerolith.
- [x] A Markdown twin of every page, indexed by `llms.txt` and `llms-full.txt`.
- [x] A page for every diagnostic code.
- [x] The site on [GitHub Pages](https://molexxxx.github.io/zerolith/), deployed by each release from the commit it published.
- [ ] The site at the project's own domain.
- [ ] A versioned API manifest that feeds the agent index and editor tooling.
- [ ] Type-checked code samples on every page.
- [ ] Link, prose, and spelling checks in CI.
- [ ] A VS Code extension for templates, generated from the manifest.

## Coding agents

- [x] An `AGENTS.md` in this repository and in every project `zerolith new` writes.
- [ ] An MCP server for the docs.
- [ ] An MCP server inside the dev server that exposes the reactive graph, with a read-only mode.
- [ ] Agent Skills.
- [ ] A public eval suite that measures whether the in-repo context helps agents, published with its method. No claim about agent results appears before it.

## Adoption

- [ ] The first production site moves onto zerolith, served buildless.
- [ ] An Electron desktop application adopts zerolith view by view: custom elements inside its existing React tree, the typed client over its IPC bridge, and state bridged to signals.
- [ ] A showcase of applications built with zerolith, and named design partners.
- [ ] zero-query, the predecessor, moves to maintenance and later retires.

## Project and supply chain

- [x] Governance, a security policy, a 24-month support window, release and versioning policies, and the RFC process with a seven-day final comment period.
- [x] A code of conduct, a contributing guide, issue forms, a pull request template, and code owners.
- [x] SHA-pinned workflows, OpenSSF Scorecard, a CycloneDX SBOM, and provenance on every published package.
- [x] Private vulnerability reporting and secret scanning with push protection.
- [x] One version across every package and the crate, set by a script and checked by a test, and a dry run of the release workflow before each publish.
- [x] GitHub releases created by the release workflow, with the version's changelog section and the SBOM attached.
- [ ] Trusted publishing for every npm package, with no npm token left anywhere. Every npm package has a trusted publisher allowed to publish and move dist-tags, and the next release is the first to use it. The crate keeps publishing with a crates.io token.
- [ ] Canary releases on every merge under the `canary` dist-tag.
- [ ] The OpenSSF Best Practices badge, passing and then silver.
- [ ] A trademark search for the name.

## Community

- [x] The RFC process and contributing guide.
- [ ] A contributor ladder, and a second maintainer with release rights.
- [ ] An adapter contract and a directory for third-party packages.
- [ ] Sponsorship with a line for funding ecosystem work.

## Not planned

- **A required compiler.** The bundler and the command line optimize; plain files always run.
- **WebRTC in the core.** A separate package may follow later.
- **Coupling to a particular backend.** zerolith talks to servers over plain HTTP.
