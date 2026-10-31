<h1>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/github/readme-header-dark.svg">
  <img alt="zerolith: Full framework. Zero guesswork." src="brand/github/readme-header-light.svg">
</picture>
</h1>

<p>
  <a href="https://www.npmjs.com/package/zerolith"><img src="https://raw.githubusercontent.com/molexxxx/molexxxx/main/.github/badges/zerolith-npm-zerolith.svg" alt="npm"></a>
  <a href="https://crates.io/crates/zerolith"><img src="https://raw.githubusercontent.com/molexxxx/molexxxx/main/.github/badges/zerolith-crates-zerolith.svg" alt="crates.io"></a>
  <a href="https://github.com/molexxxx/zerolith/actions/workflows/ci.yml"><img src="https://raw.githubusercontent.com/molexxxx/molexxxx/main/.github/badges/zerolith-ci-zerolith.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://raw.githubusercontent.com/molexxxx/molexxxx/main/.github/badges/zerolith-license-zerolith.svg" alt="license"></a>
  <a href="https://molexxxx.github.io/zerolith/"><img src="https://raw.githubusercontent.com/molexxxx/molexxxx/main/.github/badges/zerolith-docs-zerolith.svg" alt="docs"></a>
  <a href="https://github.com/molexxxx/zerolith/commits/main"><img src="https://raw.githubusercontent.com/molexxxx/molexxxx/main/.github/badges/zerolith-last-commit-zerolith.svg" alt="last commit"></a>
</p>

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

Node 24 or newer is required. Install the command line once; npm puts the prebuilt binary for your platform on your PATH:

```sh
npm install --global @zerolith/cli@alpha
```

Then write a starter application and run it:

```sh
zerolith new my-app
cd my-app
zerolith dev
```

`zerolith new` asks a few questions. Enter takes the default, a flag answers a question on the command line, and `--yes` takes every default without asking:

| Choice | Default | Other choices |
| --- | --- | --- |
| Language | TSX | `--template ts`, `--template jsx`, or `--template js` |
| Dev server and build | The zerolith command line | `--vite` for Vite with `@zerolith/vite` |
| Production output | One minified bundle | `--buildless` for the modules behind an import map |
| Inspector | Included | `--no-devtools` |
| Dependencies | Installed | `--no-install` |

In the project:

| Command | What it does |
| --- | --- |
| `zerolith dev` | Serves the app at http://127.0.0.1:8080/ and reloads it as you edit |
| `zerolith build` | Bundles and minifies it into `dist/`, static files for any host or backend |
| `zerolith preview` | Serves `dist/` the way a host will, to check the build |

Without a global install, `npx @zerolith/cli@alpha new my-app` writes the project, and inside it `npx zerolith dev` and the `dev`, `build`, and `preview` npm scripts run the project's own copy of the command line, which is what CI should use. The starter's README covers deploying, environment variables, and when Vite is worth adding, and the [command line guide](docs/guide/command-line.md) has every option.

To add zerolith to an existing project, install `zerolith@alpha` and the `@zerolith/*` packages you need at the same tag, with `@zerolith/cli` for the commands. To work against a backend, the [building and serving guide](docs/guide/deploying.md) covers the dev server's proxy, a base path, and serving the build from a static host, a web server, or the backend itself.

Every night that the code changed, every package is also published under the `canary` tag, built from the main branch: `npx @zerolith/cli@canary new my-app` starts a project on it.

## Why zerolith

- **Clear patterns, coded diagnostics.** Each concept has one documented form, and every runtime error carries a stable code, its cause, and the fix, with a page per code. See [diagnostics](docs/guide/diagnostics.md).
- **Buildless or bundled, same files.** Plain JavaScript and `html` templates run from an import map with no build step, and `zerolith build` bundles the same files into minified, hashed chunks with the Rust command line alone. See the [command line guide](docs/guide/command-line.md).
- **Docs that cannot drift.** Every example in the guides is application code that runs as a test in CI, and the API reference is generated from the source.
- **Ready for coding agents.** An always-on [AGENTS.md](AGENTS.md) in every project, the zerolith [Agent Skill](skills/zerolith/SKILL.md) (`npx skills add molexxxx/zerolith`) with every guide as a reference, a Markdown twin of every docs page indexed by `llms.txt`, and template checks in `zerolith doctor` that flag mistakes such as frozen reads before the code runs. See [coding agents](docs/guide/agents.md).
- **Dev tools wherever it runs.** The inspector is a plain module, so it works under any dev server, a static server, electron-vite, or `file://`, with no browser extension. See [dev tools](docs/guide/dev-tools.md).

## What works today

Everything below runs, is tested in this repository, and is published under the `alpha` dist-tag.

| Area | Package | What it does |
| --- | --- | --- |
| Core | `zerolith` | Signals, `html` and `css` templates with keyed lists and conditions, rendering, hydration, server rendering, custom elements, JSX types, coded diagnostics |
| Routing | `@zerolith/router` | A typed route table, plain anchors, route data, head tags, a base path, and server rendering with embedded route state |
| Forms | `@zerolith/forms` | Native forms enhanced with fetch, pending state, Standard Schema validation, and field errors as RFC 9457 problem details |
| Data | `@zerolith/client` | Types and a route table generated from OpenAPI 3.x, checked calls, problems for failures, and a MessagePort transport |
| i18n | `@zerolith/i18n` | Locale negotiation, direction, formatters, and MessageFormat 2 catalogs compiled to typed per-locale modules |
| Accessibility | `@zerolith/a11y` | Focus trap, roving tabindex, live announcer, focus origin, visually hidden text, and preference signals |
| Testing | `@zerolith/test` | `mount`, `cleanup`, `settle`, and hydration and accessibility checks |
| Dev tools | `@zerolith/devtools` | The in-page inspector, named signals, and Performance panel tracks |
| Observability | `@zerolith/otel` | OpenTelemetry spans for navigation, hydration, and requests |
| Command line | `@zerolith/cli` | The Rust command line with prebuilt binaries: `new`, `dev` with packages resolved from `node_modules`, a proxy to backends, and a base path, `build`, which bundles and minifies with templates prepared ahead of time, `preview`, `importmap` with integrity hashes, and `doctor`, with shared settings in `zerolith.json` |
| Vite | `@zerolith/vite` | For projects on Vite: JSX lowering, hot replacement that keeps named state, transform-time warnings, templates prepared at build time, and a production build check |

Three example applications show it end to end: [notes](examples/notes), plain JavaScript on `zerolith dev` and `zerolith build`; [tasks](examples/tasks), TypeScript with a backend API, a typed client, and compiled messages, developed on Vite and bundled by `zerolith build`; and [fullstack](examples/fullstack), an app under `/app/` with a Node backend, reached through the dev server's proxy while developing and serving the build in production.

## Where it's going

Next come the first production site, faster keyed lists measured on js-framework-benchmark, and a frozen API for the core, templates, and router. After 1.0 come the application utilities, signals kept in storage, undo, sensors, retry, and transitions among them, signals the server can push, richer dev tools with an MCP server for agents, and an editor extension. The [roadmap](docs/ROADMAP.md) has the full picture.

## Documentation

- The [docs site](https://molexxxx.github.io/zerolith/), rebuilt with every release: a [tutorial](https://molexxxx.github.io/zerolith/learn/) that builds an app step by step, the guides, a [playground](https://molexxxx.github.io/zerolith/playground/) that runs zerolith in the browser, the API reference generated from the source, and a page for every diagnostic code.
- [Guides](docs/guide/index.md), from [application structure](docs/guide/structure.md) and [building and serving](docs/guide/deploying.md) to [testing](docs/guide/testing.md). `npm run docs` builds them into a site with the generated reference.
- The [roadmap](docs/ROADMAP.md), the [changelog](CHANGELOG.md), and the [releases](https://github.com/molexxxx/zerolith/releases) with their SBOMs.
- [Support window and channels](docs/policy/support.md), [releases](docs/policy/releases.md), and [versioning](docs/policy/versioning.md).
- [Brand](brand/README.md): the mark, colors, type, and icons.

## Working on zerolith

To run the examples from a clone or to change zerolith itself, follow [CONTRIBUTING.md](CONTRIBUTING.md): it sets up the packages and the command line, lists the commands that run each example, and lists the checks CI runs. The [notes](examples/notes/README.md) and [tasks](examples/tasks/README.md) READMEs walk through developing, building, and previewing each one.

## Community

- Questions and ideas go to [GitHub Discussions](https://github.com/molexxxx/zerolith/discussions); see [SUPPORT.md](SUPPORT.md).
- Bugs go to [issues](https://github.com/molexxxx/zerolith/issues/new/choose). Report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Changes to the public API start as an RFC under [GOVERNANCE.md](GOVERNANCE.md).
- Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## License

[Apache-2.0](LICENSE).
