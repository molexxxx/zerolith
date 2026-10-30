<h1>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/github/readme-header-dark.svg">
  <img alt="zerolith: Full framework. Zero guesswork." src="brand/github/readme-header-light.svg">
</picture>
</h1>

Routing, forms, rendering, and i18n, with clear patterns for you and your agent.

> **Alpha.** Packages publish under the `alpha` dist-tag (`npm install zerolith@alpha`) and the API is still settling. Watch the repository or join the [discussions](https://github.com/molexxxx/zerolith/discussions) to follow along.

zerolith is a standalone frontend framework: fine-grained signals, HTML templates that need no compiler, a typed router, server rendering with hydration, and a command line that develops and builds the application on its own. It talks to any backend over plain HTTP.

```ts
import { computed, html, render, signal } from "zerolith";

function Counter({ start = 0 }: { start?: number })
{
    const count = signal(start);
    const doubled = computed(() => count.get() * 2);
    return html`
        <p>Count: ${count}, doubled: ${doubled}</p>
        <button @click=${() => count.set(count.get() + 1)}>Add one</button>`;
}

render(Counter({ start: 1 }), "#app");
```

Bind the signal, not its value: `${count}` stays live, while `${count.get()}` reads once.

## Getting started

Node 24 or newer is required. Create an application with the command line, which npm installs with a prebuilt binary:

```sh
npx @zerolith/cli@alpha new my-app
cd my-app
npm install
npm run dev
```

`npm run dev` starts the development server, and `npm run build` writes the production build to `dist/`, ready for any static host or for a backend to serve. `new` writes a TypeScript project developed on Vite by default; `--js` writes JavaScript with JSDoc types, and `--buildless` writes a project that runs from an import map with no build step at all. In any of them, `npx zerolith build` bundles and minifies the application on its own, with no Vite involved; the [command line guide](docs/guide/command-line.md) covers every option.

To add zerolith to an existing project, install `zerolith@alpha` and the `@zerolith/*` packages you need at the same tag.

## Why zerolith

- **Clear patterns, coded diagnostics.** Each concept has one documented form, and every runtime error carries a stable code, its cause, and the fix, with a page per code. See [diagnostics](docs/guide/diagnostics.md).
- **Buildless or bundled, same files.** Plain JavaScript and `html` templates run from an import map with no build step, and `zerolith build` bundles the same files into minified, hashed chunks with the Rust command line alone. See the [command line guide](docs/guide/command-line.md).
- **Docs that cannot drift.** Every example in the guides is a test that runs in CI, and the API reference is generated from the source.
- **Ready for coding agents.** An always-on [AGENTS.md](AGENTS.md), a Markdown twin of every docs page indexed by `llms.txt`, and template checks in `zerolith doctor` that flag mistakes such as frozen reads before the code runs.
- **Dev tools wherever it runs.** The inspector is a plain module, so it works under any dev server, a static server, electron-vite, or `file://`, with no browser extension. See [dev tools](docs/guide/dev-tools.md).

## What works today

Everything below runs, is tested in this repository, and is published under the `alpha` dist-tag.

| Area | Package | What it does |
| --- | --- | --- |
| Core | `zerolith` | Signals, `html` and `css` templates with keyed lists and conditions, rendering, hydration, server rendering, custom elements, JSX types, coded diagnostics |
| Routing | `@zerolith/router` | A typed route table, plain anchors, route data, head tags, and server rendering with embedded route state |
| Forms | `@zerolith/forms` | Native forms enhanced with fetch, pending state, Standard Schema validation, and field errors as RFC 9457 problem details |
| Data | `@zerolith/client` | Types and a route table generated from OpenAPI 3.x, checked calls, problems for failures, and a MessagePort transport |
| i18n | `@zerolith/i18n` | Locale negotiation, direction, formatters, and MessageFormat 2 catalogs compiled to typed per-locale modules |
| Accessibility | `@zerolith/a11y` | Focus trap, roving tabindex, live announcer, focus origin, visually hidden text, and preference signals |
| Testing | `@zerolith/test` | `mount`, `cleanup`, `settle`, and hydration and accessibility checks |
| Dev tools | `@zerolith/devtools` | The in-page inspector, named signals, and Performance panel tracks |
| Observability | `@zerolith/otel` | OpenTelemetry spans for navigation, hydration, and requests |
| Command line | `@zerolith/cli` | The Rust command line with prebuilt binaries: `new`, `dev`, `serve`, `build`, which bundles and minifies with templates prepared ahead of time, `importmap` with integrity hashes, and `doctor` |
| Vite | `@zerolith/vite` | For projects on Vite: JSX lowering, hot replacement that keeps named state, transform-time warnings, templates prepared at build time, and a production build check |

Two example applications show it end to end: [notes](examples/notes), which runs from its sources with no build step, and [tasks](examples/tasks), developed on Vite and bundled by `zerolith build`, with a typed client and compiled messages.

## Where it's going

Next come a dev server that matches the build, with a proxy to any backend, then a permanent domain for the docs, trusted publishing with a canary channel built from every merge, the first production site, and a frozen API for the core, templates, and router. After that come signals the server can push, agent tooling with MCP servers and a public eval suite, and an editor extension. The [roadmap](docs/ROADMAP.md) has the full picture.

## Documentation

- The [docs site](https://molexxxx.github.io/zerolith/), rebuilt with every release: the guides, the API reference generated from the source, and a page for every diagnostic code.
- [Guides](docs/guide/index.md), from [application structure](docs/guide/structure.md) to [testing](docs/guide/testing.md). `npm run docs` builds them into a site with the generated reference.
- The [roadmap](docs/ROADMAP.md), the [changelog](CHANGELOG.md), and the [releases](https://github.com/molexxxx/zerolith/releases) with their SBOMs.
- [Support window and channels](docs/policy/support.md), [releases](docs/policy/releases.md), and [versioning](docs/policy/versioning.md).
- [Brand](brand/README.md): the mark, colors, type, and icons.

## Working on zerolith

This repository holds the packages, the Rust command line, the docs, and the examples. From a clone:

```sh
git clone https://github.com/molexxxx/zerolith.git
cd zerolith
npm ci
npm run build
npm run serve
```

Here `npm run build` compiles every package from TypeScript into its `dist/` folder, which the examples and the tests load; it does not bundle an application. `npm run serve` then serves the repository, and the notes example opens at http://127.0.0.1:8080/examples/notes/ straight from its sources and import map. The [tasks README](examples/tasks/README.md) shows how to run that example on Vite and bundle it with `zerolith build`, and [CONTRIBUTING.md](CONTRIBUTING.md) lists every script, including `npm run check`, the gate CI runs.

## Community

- Questions and ideas go to [GitHub Discussions](https://github.com/molexxxx/zerolith/discussions); see [SUPPORT.md](SUPPORT.md).
- Bugs go to [issues](https://github.com/molexxxx/zerolith/issues/new/choose). Report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Changes to the public API start as an RFC under [GOVERNANCE.md](GOVERNANCE.md).
- Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## License

[Apache-2.0](LICENSE).
