<h1>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/github/readme-header-dark.svg">
  <img alt="zerolith: Full framework. Zero guesswork." src="brand/github/readme-header-light.svg">
</picture>
</h1>

Routing, forms, rendering, and i18n, with clear patterns for you and your agent.

> **Alpha.** Packages publish under the `alpha` dist-tag (`npm install zerolith@alpha`) and the API is still settling. Watch the repository or join the [discussions](https://github.com/molexxxx/zerolith/discussions) to follow along.

zerolith is a standalone frontend framework: fine-grained signals, HTML templates that need no compiler, a typed router, server rendering with hydration, and tooling that works wherever the app is served. It talks to any backend over plain HTTP.

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

## Why zerolith

- **Clear patterns, coded diagnostics.** Each concept has one documented form, and every runtime error carries a stable code, its cause, and the fix, with a page per code. See [diagnostics](docs/guide/diagnostics.md).
- **Buildless or bundled, same files.** Plain JavaScript and `html` templates run from an import map or through Vite. The bundler and the Rust command line optimize; neither is required. See the [command line](docs/guide/command-line.md) and [Vite](docs/guide/vite.md) guides.
- **Docs that cannot drift.** Every example in the guides is a test that runs in CI, and the API reference is generated from the source.
- **Ready for coding agents.** An always-on [AGENTS.md](AGENTS.md), a Markdown twin of every docs page indexed by `llms.txt`, and a Vite plugin that flags mistakes such as frozen reads at transform time.
- **Dev tools wherever it runs.** The inspector is a plain module, so it works under Vite, a static server, electron-vite, or `file://`, with no browser extension. See [dev tools](docs/guide/dev-tools.md).

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
| Build | `@zerolith/vite` | Hot replacement that keeps named state, JSX lowering, transform-time warnings, and a production build check |
| Command line | `zerolith` (Rust) | `new`, `dev`, `serve`, `build`, `importmap` with integrity hashes, and `doctor` |

Two example applications show it end to end: [notes](examples/notes) with no build step, and [tasks](examples/tasks) on Vite with a typed client and compiled messages.

## Getting started

Node 24 or newer is required. Scaffold an application with the command line, which comes from npm with a prebuilt binary:

```sh
npx @zerolith/cli@alpha new my-app
cd my-app
npm install
npm run dev
```

`new` writes a Vite and TypeScript project by default; `--js` writes JavaScript with JSDoc types, and `--buildless` writes a project that runs from an import map with no bundler. To add zerolith to an existing project, install `zerolith@alpha` and the `@zerolith/*` packages you need at the same tag.

The examples run from a clone:

```sh
git clone https://github.com/molexxxx/zerolith.git
cd zerolith
npm ci
npm run build
npm run serve
```

Then open http://127.0.0.1:8080/examples/notes/.

## Where it's going

Next is a frozen API for the core, templates, and router, and a canary channel built from every merge to the default branch. After that come signals the server can push, agent tooling with MCP servers and a public eval suite, and an editor extension. The [roadmap](docs/ROADMAP.md) has the full picture.

## Documentation

- [Guides](docs/guide/index.md), from [application structure](docs/guide/structure.md) to [testing](docs/guide/testing.md). `npm run docs` builds them into a site with the generated reference.
- The [roadmap](docs/ROADMAP.md) and the [changelog](CHANGELOG.md).
- [Support window and channels](docs/policy/support.md), [releases](docs/policy/releases.md), and [versioning](docs/policy/versioning.md).
- [Brand](brand/README.md): the mark, colors, type, and icons.

## Community

- Questions and ideas go to [GitHub Discussions](https://github.com/molexxxx/zerolith/discussions); see [SUPPORT.md](SUPPORT.md).
- Bugs go to [issues](https://github.com/molexxxx/zerolith/issues/new/choose). Report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Changes to the public API start as an RFC under [GOVERNANCE.md](GOVERNANCE.md).
- Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## License

[Apache-2.0](LICENSE).
