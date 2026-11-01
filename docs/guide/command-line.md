---
title: Command line
description: "The Rust command line: a dev server that resolves packages itself, production builds bundled with Rolldown, a preview server, import maps with integrity hashes, and project checks."
order: 12
group: Tooling
---

# Command line

The `zerolith` binary is written in Rust and covers the parts of development that need a process outside the browser:

| Command | What it does |
| --- | --- |
| `zerolith dev` | Serves the project with live reload while you work |
| `zerolith serve` | Serves the project the same way, without watching it |
| `zerolith build` | Bundles the application for production into `dist/` |
| `zerolith preview` | Serves a build as a static host would, to check it before deploying |
| `zerolith new` | Writes a starter application or the fullstack example |
| `zerolith skill` | Writes the zerolith skill for coding agents into a project |
| `zerolith importmap` | Vendors the packages and writes an import map with integrity hashes |
| `zerolith doctor` | Checks a project and reports coded findings |

## Installing

| Where | How |
| --- | --- |
| Anywhere npm runs, on Linux (glibc), macOS, or Windows, x64 or arm64 | `npm install --global @zerolith/cli@alpha` puts `zerolith` on the PATH |
| Inside a project | `@zerolith/cli` as a development dependency, as every starter has it, runs as `npx zerolith` and through the npm scripts |
| Elsewhere, and on musl systems such as Alpine | `cargo install zerolith` builds the same crate from crates.io, and `ZEROLITH_BINARY_PATH` tells the npm package where it is |

`@zerolith/cli` is a thin package whose optional dependencies carry the prebuilt binary for each platform, so npm installs only the one it needs.

> [!IMPORTANT]
> The build prepares templates into calls to the `zerolith/internal` entry of the `zerolith` the project installs, which can change with every version. `zerolith build` therefore requires the `zerolith` of its own version and stops with `package_version_mismatch` when it finds another; the starters pin both to one version, so upgrade them together.

Every command opens with the `zerolith` badge and the command's name, and colors what follows by meaning: addresses and finished steps in green, errors in red, warnings in yellow, and labels and details dimmed. The colors are dropped when `NO_COLOR` is set or the output goes to a file or another program, so logs and CI output stay plain text, and `CLICOLOR_FORCE=1` keeps them.

## dev, serve, and preview

```sh
zerolith dev
zerolith dev my-app --port 3000
zerolith dev --base /app/ --proxy /api=http://127.0.0.1:3000
zerolith preview
```

`dev` serves the project with live reload. The page names its entry module, such as `<script type="module" src="/src/main.ts"></script>`, and nothing else; the server answers each request the way the build will see it:

| A request for | Is answered with |
| --- | --- |
| A `.ts`, `.tsx`, or `.jsx` file | JavaScript, with types stripped through oxc and JSX lowered to the same `html` calls the build produces |
| A package, as `import { html } from "zerolith"` | The module from `node_modules`, found with the resolver and conditions `build` uses, the development build of zerolith included, so the page needs no import map and a new file needs nothing but an import |
| A stylesheet imported from a module, as `import "./card.css"` | The rules, applied through a `<style>` element |
| An image, font, or other file imported from code | Its URL; `?url` gives any file's URL, `?raw` its text, and a JSON import its value, all as in `build` |
| A file in `public/` | The file, served at the root |
| A client-side route, such as `/notes/abc` | The application's `index.html` |
| A package outside the project folder, such as a workspace package in a monorepo | The module, served under `/@fs/` from the folders of the packages that imports resolved to, and from nowhere else |

A CommonJS package, which a browser cannot load as a module, is reported by name; import the package's ES module build instead.

### Live reload

The server injects a small module into HTML pages and announces file changes over server-sent events. The terminal shows a line for each change:

| A change to | Does |
| --- | --- |
| A stylesheet, linked or imported | `update`: the stylesheet is swapped in place |
| Any other file | `reload`: the page reloads |
| A file inside `node_modules`, `dist`, or another tooling folder | Nothing |

Before reloading, the client saves the values of every named signal, and the development build of zerolith restores them when signals with the same names are created again, so a form draft or a selected tab survives an edit with no component boundary:

```ts
const draft = signal("", { name: "draft" });    // restored across dev reloads
```

Under Vite, the plugin in `@zerolith/vite` does the same restore without reloading the page; see [Vite](vite.md).

### Serving and previewing

`serve` serves the project the way `dev` does, without watching it. `preview` serves a build's output folder, `dist` unless `--out` names another, as a static host would: every file as it is, and `index.html` for any path that names no file, so client-side routes load directly.

| Command | Default port |
| --- | --- |
| `dev` and `serve` | 8080 |
| `preview` | 4173, so it can run next to `dev` |

When the default port is taken, as 8080 often is on Windows, the command takes the next free one and says so in the banner. A port given with `--port` or in `zerolith.json` is used as it is, and a taken one fails with a message that says so.

| Option | What it does |
| --- | --- |
| `--port <number>` | Listens on that port |
| `--base /app/` | Serves the application under a path, as a backend or a reverse proxy will: the site root redirects there, paths under it load the project with the same route fallback, and `import.meta.env.BASE_URL` carries it for the router |
| `--proxy /api=http://127.0.0.1:3000` | Forwards every request under `/api` to a backend, so the page reaches its API on its own origin; repeat it for more paths |
| `--out <folder>` | For `preview`: the folder to serve |

[Building and serving](deploying.md) describes the proxy in full. On loopback, the server also answers `/.well-known/appspecific/com.chrome.devtools.json`, which lets Chrome DevTools edit the project's files in place.

## zerolith.json

The settings the commands share live in `zerolith.json` next to `index.html`, so they are written once instead of on every command line. A flag overrides the file, and the starters that `zerolith new` writes on the command line include one that points at the schema `@zerolith/cli` ships, so an editor completes the keys:

```json
{
    "$schema": "./node_modules/@zerolith/cli/zerolith.schema.json",
    "base": "/app/",
    "proxy": {
        "/api": "http://127.0.0.1:3000",
        "/auth": { "target": "http://127.0.0.1:4000", "stripPrefix": true }
    },
    "dev": { "port": 5000 },
    "preview": { "port": 5001 },
    "build": { "out": "../server/public" }
}
```

| Key | Used by | What it sets |
| --- | --- | --- |
| `base` | `dev`, `build`, `preview` | The path the application is served under |
| `proxy` | `dev`, `serve`, `preview` | Path prefixes forwarded to backends: an `http://` address, or an object with `target` and `stripPrefix` |
| `dev.port` | `dev`, `serve` | The port, used as it is |
| `preview.port` | `preview` | The port, used as it is |
| `build.out` | `build`, `preview` | The output folder, relative to the project unless absolute |

An unknown key fails with the file's name, so a typo does not go unnoticed. `build --unbundled` does not apply `base` and says so.

## Environment variables

`import.meta.env` carries these values in every module:

| Value | Holds |
| --- | --- |
| `MODE` | `development` under `dev`, and `production` under `build` unless `--mode` names another |
| `DEV` and `PROD` | Whether the mode is development or production |
| `BASE_URL` | The path the application is served under |
| `PUBLIC_*` | Every variable whose name starts with `PUBLIC_` |

The variables are read from `.env`, `.env.local`, `.env.<mode>`, and `.env.<mode>.local` in the project folder, each overriding the one before, and from the environment over all of them:

```sh
# .env
PUBLIC_API_URL=https://api.example.com
DATABASE_PASSWORD=stays-on-the-server
```

```ts
const response = await fetch(`${import.meta.env.PUBLIC_API_URL}/tasks`);
```

> [!IMPORTANT]
> Only the `PUBLIC_` prefix reaches the browser, so a secret kept in the same file never does. `build` replaces each value in the code, and `dev` does the same in every module it serves; restart `dev` after editing a `.env` file.

## build

```sh
zerolith build
zerolith build --base /app/ --out ../server/static
zerolith build --unbundled
```

Bundles the application for production with [Rolldown](https://rolldown.rs), the bundler Vite is built on, compiled into the binary: no Node tooling runs and nothing else needs installing. The command prints every file it wrote, with the gzip size of each text file:

```text
 zerolith  build  production, minified

  dist/assets/de-DWUa6-jV.js       1.69 kB  gzip  0.79 kB
  dist/assets/en-BR-GMg9l.js       1.62 kB  gzip  0.76 kB
  dist/assets/index-BcViqks6.js   45.39 kB  gzip 14.90 kB
  dist/assets/index-a01166d1.css   0.81 kB  gzip  0.41 kB
  dist/index.html                  0.57 kB  gzip  0.37 kB

  built tasks into dist in 91 ms
```

| Option | What it does |
| --- | --- |
| `--out <folder>` | The output folder, `dist` unless `zerolith.json` sets `build.out` |
| `--base <path>` | The public path every URL the build writes uses, such as `/app/`, or `./` for URLs relative to the page |
| `--mode <name>` | `production` by default; any other mode, such as `staging`, resolves the development build of zerolith with its diagnostic text |
| `--sourcemap` | Writes a source map next to each chunk |
| `--no-minify` | Keeps names and whitespace, while still removing dead code |
| `--no-prepare` | Keeps the template scanner and leaves every `html` literal as it is |
| `--empty-out-dir` | Empties an output folder outside the project before writing into it |
| `--unbundled` | Writes the buildless output, the modules behind an import map, instead of a bundle |

### Scripts and chunks

The build starts from `index.html`. Every `<script type="module" src="...">` with a local source is an entry, and the modules it imports, TypeScript, TSX, JSX, and JavaScript alike, are bundled into minified, tree-shaken chunks under `assets/`, each with a content hash in its name so a host can cache it forever. Packages resolve from `node_modules`, with the production build of zerolith.

The zerolith passes are the ones `vite build` runs through the [Vite plugin](vite.md), held to the same output by shared fixtures. JSX is lowered to `html` calls. Every module goes through the template prepare pass: each `html` literal is scanned ahead of time and registered next to the literal, a template with no bindings is created once at module scope, and the core's scanner is replaced by a stand-in that reports `template_not_prepared`, so the browser binds templates without scanning them and the scanner is not shipped. A template the scanner refuses fails the build at its line, and so does a module that uses `html` from zerolith other than as a template tag.

A view loaded with the router's `lazy()` and each locale of a message index compiled by `zerolith-i18n` get chunks of their own, fetched when they are needed, and the build fails with `lazy_module_not_split` when one of them is also imported statically, which would merge it into the importing chunk. A module that an entry and a lazy chunk share gets a chunk both import. The page preloads every chunk its entries import statically with `<link rel="modulepreload">`, so the browser fetches them in parallel instead of discovering them one import at a time.

### Stylesheets

Stylesheets become one file. The ones the page links and the ones modules import, as in `import "./card.css"`, are combined in the order the page and the modules load them, through [lightningcss](https://lightningcss.dev): local `@import`s are inlined in place under their `layer()`, `supports()`, and media conditions, a remote `@import` moves to the top where CSS requires it, and the result is lowered for the oldest [supported browsers](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md), with nesting flattened, fallbacks for newer color functions, and the vendor prefixes those browsers need, then minified. The page's first local stylesheet link loads the result, and the others are removed. A stylesheet link to a file that is not in the project, such as one the host serves next to the app, is kept as it is, with a warning.

### Files and URLs

Files are copied into `assets/` under a content hash when a stylesheet references them with `url()`, when a module imports them, and when the page names them in an icon, manifest, or preload `<link>`, an `<img>`, `<source>`, `<video>`, `<audio>`, or `<track>`, or a classic `<script>`. Importing an image, font, media file, or document gives its URL; `?url` gives any file's URL and `?raw` its text:

```ts
import logo from "./logo.svg";
import license from "../LICENSE?raw";
```

A root-absolute URL such as `/favicon.svg` is looked up in `public/` first. The files in `public/` are copied into the output as they are and keep their URLs, so files that need a fixed name, such as `robots.txt`, a web manifest, and the favicon, go there.

`--base /app/` suits an application a backend or a reverse proxy serves under `/app/`, and `--base ./` a page opened from disk or embedded at a path not known in advance. Modules read the mode, the base, and the `PUBLIC_` variables through `import.meta.env`, as [Environment variables](#environment-variables) describes, and the build replaces each with its value, as it replaces `process.env.NODE_ENV` for packages written for Node bundlers.

### Browsers and syntax

The output keeps ES2022 syntax as written. Lowering class fields for the oldest supported browsers would turn every field into a function call, slowing every class, so class static blocks need Chrome 94 and `#field in` checks Chrome 91; newer syntax, such as `using` declarations, is lowered.

> [!NOTE]
> As in Vite, the `paths` of a `tsconfig.json` do not take part in resolution. Give a module an alias through the `imports` field of `package.json` instead, which TypeScript, Node, and the build all read.

### The output folder

The output folder is emptied first when it is inside the project. One outside the project, such as the static folder of a backend next to it, is written over without being emptied unless `--empty-out-dir` is passed, and a folder that holds the project or a source the page loads is refused. The page's import map and its module preload links to local files, such as the ones `zerolith importmap` writes, are dropped, since the bundle resolves packages itself and preloads its own chunks, so a project that runs from an import map while developing builds the same way.

### Unbundled output

`--unbundled` writes the buildless output instead, for a project served with an import map in production. No bundler runs: the output is the project's modules, served as they are.

- Every file under the project is copied into the output folder, except `node_modules`, `vendor`, `dist`, `target`, `test`, hidden folders and files, and the development files: `package.json`, `tsconfig.json`, `AGENTS.md`, `README.md`, and `*.config.*`.
- `.ts`, `.tsx`, `.jsx`, and `.mts` sources are transformed to JavaScript the same way `dev` serves them and renamed to `.js`, and the relative imports that named them, static and dynamic, are rewritten to `.js`, as are the module scripts in HTML pages.
- Every module goes through the same template prepare pass.
- The installed packages are vendored into `vendor/` inside the output, through the prepare pass as well, with an import map carrying integrity hashes written into every page at the output's root.

## new

```sh
zerolith new
zerolith new my-app --yes
zerolith new my-app --template ts --vite --no-install
zerolith new my-app --example fullstack
```

Writes a starter application and installs its dependencies. On a terminal it asks for what the flags leave open, each question with a default that Enter takes, and outside a terminal the defaults apply without asking:

| Question | Default | Flag |
| --- | --- | --- |
| The starting point | The starter | `--example fullstack` |
| The folder | `zerolith-app` | The first argument |
| The language | TSX | `--template tsx`, `ts` with `html` templates, `jsx`, or `js` with `html` templates and JSDoc types |
| The dev server and build | The command line | `--vite` for Vite with `@zerolith/vite`, or `--buildless` for the command line deploying the modules behind an import map |
| The inspector | Included | `--no-devtools` |
| The zerolith skill for coding agents | Included | `--no-skill` |
| Installing the dependencies | Yes, with the package manager that ran the command | `--no-install` |

`--yes` takes the defaults for everything the flags leave open, the starter among them.

The starter is three pages in the brand style: a home page that shows the workflow, a counter built on a named signal, and a searchable list that a resource loads from `public/data/packages.json`. It has the layout the [structure guide](structure.md) describes, a browser test, `src/env.d.ts` typing `import.meta.env`, an `AGENTS.md` for coding agents, and a README that walks through developing, building, previewing, deploying, environment variables, and when Vite is worth adding. Its `dev`, `build`, and `preview` scripts run the command line, or Vite with `--vite`; `--buildless` keeps `zerolith dev` and builds with `--unbundled`. The tool versions it pins are the ones this repository tests with.

`--example fullstack` writes the [fullstack example](https://github.com/molexxxx/zerolith/tree/main/examples/fullstack) as a project of its own instead: a notes page under `/app/` that lists and adds notes through a JSON API under `/api`, and `server.ts`, its backend in plain Node with no dependencies. `zerolith.json` sets the base and forwards `/api` to the backend on port 3001, so development runs two processes, `npm run api` for the backend and `npm run dev` for `zerolith dev`; `npm run build` writes `dist/` for the base, and `npm start` serves the API and the build from the backend. The project comes with a test of the backend in Node and one of the notes page in Chromium, an `AGENTS.md`, and a README on the two processes and on deploying, and pins the same versions as the starter. The example is TypeScript with `html` templates on the command line, so the language, dev server, and inspector questions are not asked for it, and `--template`, `--vite`, or `--buildless` given with `--example` stops the command with a message that names the flag.

## skill

```sh
zerolith skill
zerolith skill my-app
```

Writes the zerolith skill for coding agents into the project: its rules, one pattern for each concept, and every guide and diagnostic code as references, built into the command line so the copy describes this version. It goes into `.agents/skills/zerolith/`, which Codex, Cursor, GitHub Copilot, Gemini CLI, and most other agents read, and `.claude/skills/zerolith/`, which Claude Code reads, replacing an earlier copy in either; `SKILL.md` records the version under `metadata`. `zerolith new` runs it for every new project unless `--no-skill` is given.

Nothing more is needed: an agent started in the project finds the skill and loads it when a task involves zerolith. The copy does not change on its own, so run the command again after upgrading zerolith; `zerolith doctor` reports `skill_outdated` until then. The [coding agents guide](agents.md) covers what an agent reads and when.

## importmap

```sh
zerolith importmap --html index.html
```

Copies the installed `zerolith`, `@zerolith/router`, `@zerolith/forms`, `@zerolith/client`, and `@zerolith/devtools` modules into `vendor/`, writes `vendor/importmap.json`, and replaces or inserts the import map and `modulepreload` links in the page. The map carries an `integrity` entry with the SRI hash of every module reachable from the entries, so a modified file fails to load, and each preload link carries the same hash, since a browser reuses a preload only when its integrity matches the module request's.

| Option | What it does |
| --- | --- |
| `--html <file>` | The page whose import map and preload links are replaced or inserted |
| `--out <folder>` | Where the packages are copied, `vendor` by default; it is the URL prefix too |
| `--development` | Maps the entries with diagnostic text and the inspector instead of the production ones |

## doctor

```sh
zerolith doctor
zerolith doctor --json
```

Reports coded findings, each with a cause and a fix, as text or as JSON with `--json`. The exit code is 1 when any finding is an error, so a CI step can run it as it is. It checks the page first:

| Code | Severity | Means |
| --- | --- | --- |
| `index_missing` | Error | There is no `index.html` |
| `module_script_missing` | Warning | The page loads no module script |
| `importmap_invalid` | Error | The page's import map is not valid JSON |
| `importmap_target_missing` | Error | The map points a specifier at a file that does not exist |
| `integrity_mismatch` | Error | A file changed after the import map was written |
| `integrity_target_missing` | Error | A file has an integrity hash but does not exist |
| `preload_integrity_mismatch` | Warning | A preload link lacks the hash the map gives its module, so the browser downloads the module twice |
| `package_outdated` | Warning | The vendored version of a package differs from the installed one |
| `skill_outdated` | Warning | The zerolith skill describes another version than the installed zerolith |

The import map checks apply only to a page that has a map, as `zerolith importmap` writes one; a page without one is complete, since `dev` resolves the packages and `build` bundles them.

It then runs the template lint of the [Vite plugin](vite.md) over the project's `.js`, `.ts`, `.jsx`, and `.tsx` sources, outside `node_modules`, `vendor`, `dist`, `target`, test folders, and hidden folders, and reports the same warnings with the file, line, and column: `template_frozen_read`, `image_without_alt`, `button_without_name`, and `frame_without_title`. JSX is lowered first, keeping its lines, so a finding in a `.tsx` file points at the line its element starts on. A shared fixture holds the two implementations to the same findings.
