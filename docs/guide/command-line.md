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
| Anywhere npm runs, on Linux (glibc), macOS, or Windows, x64 or arm64 | `npm install --global @zerolith/cli` puts `zerolith` on the PATH |
| Inside a project | `@zerolith/cli` as a development dependency, as every starter has it, runs as `npx zerolith` and through the npm scripts |
| Elsewhere, and on musl systems such as Alpine | `cargo install zerolith --locked` builds the same crate from crates.io, with the dependencies it was tested with, and `ZEROLITH_BINARY_PATH` tells the npm package where it is |

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
| A `.ts`, `.tsx`, or `.jsx` file | JavaScript, with types stripped through oxc and JSX lowered to the same `html` calls the build produces; an import used only as types goes with them, as in `build` |
| A package, as `import { html } from "zerolith"` | The module from `node_modules`, found with the resolver and conditions `build` uses, the development build of zerolith included, so the page needs no import map and a new file needs nothing but an import |
| A module under a folder `zerolith importmap` wrote, which the page's import map names with an integrity hash | The file as it is, so the hash holds; the page's map resolves its imports |
| A stylesheet imported from a module, as `import "./card.css"` | The rules, applied through a `<style>` element |
| A stylesheet imported with `?scoped`, as `import card from "./card.css?scoped"` | The styles a `css` literal gives, with local `@import`s inlined; an edit to the file or to one it imports replaces the rules in place |
| An image, font, or other file imported from code | Its URL; `?url` gives any file's URL, `?raw` its text, and a JSON import its value, all as in `build`. `@zerolith/cli/assets`, which the starter's `src/env.d.ts` references, types these imports |
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
| An editor's temporary file: no extension, as `sed -i` and Vim leave, or one ending in `~`, `.swp`, `.tmp`, or `.bak` | Nothing |

A module that fails to compile is reported in the terminal and in the browser's console, with its file, even when the module that imports it fails first, as one that imports a name from it does. A stylesheet that lightningcss reads only in part, with a rule or a declaration the browser will skip, is reported the same way as a warning, with the line and column. Each problem is reported once per save, and a page that opens while it stands is told about it too.

Before reloading, the client saves the values of every named signal, and the development build of zerolith restores them when signals with the same names are created again, so a form draft or a selected tab survives an edit with no component boundary:

```ts
const draft = signal("", { name: "draft" });    // restored across dev reloads
```

Under Vite, the plugin in `@zerolith/vite` does the same restore without reloading the page; see [Vite](vite.md).

### Serving and previewing

`serve` serves the project the way `dev` does, without watching it. `preview` serves a build's output folder, `dist` unless `--out` names another, as a static host would: every file as it is, and `index.html` for any path that names no file, so client-side routes load directly. A folder that does not exist fails with what to do, and one with no `index.html`, as after `zerolith build --entry`, serves its files with a note in the banner.

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
| `--no-backends` | Starts none of the backends the proxy rules name with `run`, for one that already runs, as under a debugger |
| `--out <folder>` | For `preview`: the folder to serve |

A proxy rule in `zerolith.json` can name the command that starts its backend, as `"run": "npm run api"` beside its `target`: the server runs it in the project folder through the shell when it starts, shows its output in the same terminal, and stops it with every process it started when the server stops, so one command runs an app and its backend. The same command under several prefixes starts once, and a `--proxy` flag for a prefix replaces the file's rule, its command included. Until the backend listens, a request to its path gets a 502 that says it is out of reach, and a backend that ends on its own is reported under the banner, with its paths answering 502 until it runs again. A backend whose address already answers when the server starts, as when `zerolith dev` holds it and `zerolith preview` starts, is left as it is, and the banner says so.

[Building and serving](deploying.md) describes the proxy in full. On loopback, the server also answers `/.well-known/appspecific/com.chrome.devtools.json`, which lets Chrome DevTools edit the project's files in place.

> [!IMPORTANT]
> The server listens on the loopback address only, and it answers a request only when its `Host` header names `localhost`, a name under `.localhost`, an IP address, or a host `allowedHosts` in `zerolith.json` lists. Any other host gets 403. That stops DNS rebinding, where a page on another site points its own name at the loopback address and reads the project from the server. A name in the hosts file, such as `myapp.test`, or a tunnel's address needs an entry in `allowedHosts`.

## zerolith.json

The settings the commands share live in `zerolith.json` next to `index.html`, so they are written once instead of on every command line. A flag overrides the file, and the starters that `zerolith new` writes on the command line include one that points at the schema `@zerolith/cli` ships, so an editor completes the keys:

```json
{
    "$schema": "./node_modules/@zerolith/cli/zerolith.schema.json",
    "base": "/app/",
    "proxy": {
        "/api": { "target": "http://127.0.0.1:3000", "run": "npm run api" },
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
| `proxy` | `dev`, `serve`, `preview` | Path prefixes forwarded to backends: an `http://` address, or an object with `target`, `stripPrefix`, and `run`, the command that starts the backend with the server and stops with it |
| `allowedHosts` | `dev`, `serve`, `preview` | Host names answered besides localhost and IP addresses; one starting with a dot allows every name under it |
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
zerolith build --entry src/main.ts --name feedback-widget
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
| `--mode <name>` | `production` by default; any other mode, such as `staging`, resolves the development build of zerolith with its diagnostic text. In `production`, a module of the development build of a zerolith package that reaches the output fails the build, naming the package and the module |
| `--sourcemap` | Writes a source map next to each chunk |
| `--no-minify` | Keeps names and whitespace, while still removing dead code |
| `--no-prepare` | Keeps the template scanner and leaves every `html` literal as it is |
| `--empty-out-dir` | Empties an output folder outside the project before writing into it |
| `--unbundled` | Writes the buildless output, the modules behind an import map, instead of a bundle |
| `--entry <module>` | Writes that module as [one script](#one-script) instead of building `index.html` |
| `--name <name>` | With `--entry`: the script's file name, without `.js`, instead of the module's |

### Scripts and chunks

The build starts from `index.html`. Every `<script type="module" src="...">` with a local source is an entry, and the modules it imports, TypeScript, TSX, JSX, and JavaScript alike, are bundled into minified, tree-shaken chunks under `assets/`, each with a content hash in its name so a host can cache it forever. Packages resolve from `node_modules`, with the production build of zerolith.

The zerolith passes are the ones `vite build` runs through the [Vite plugin](vite.md), held to the same output by shared fixtures. JSX is lowered to `html` calls. Every module goes through the template prepare pass: each `html` literal is scanned ahead of time and registered next to the literal, a template with no bindings is created once at module scope, and the core's scanner is replaced by a stand-in that reports `template_not_prepared`, so the browser binds templates without scanning them and the scanner is not shipped. A template the scanner refuses fails the build at its line, and so does a module that uses `html` from zerolith other than as a template tag.

A view loaded with the router's `lazy()` and each locale of a message index compiled by `zerolith-i18n` get chunks of their own, fetched when they are needed, and the build fails with `lazy_module_not_split` when one of them is also imported statically, which would merge it into the importing chunk. A module that an entry and a lazy chunk share gets a chunk both import. The page preloads every chunk its entries import statically with `<link rel="modulepreload">`, so the browser fetches them in parallel instead of discovering them one import at a time.

### One script

`--entry` writes a module and everything it imports as one file for a page someone else writes, such as a [custom element](elements.md) other sites embed. It needs no `index.html`, and writes no page and no `public/` folder.

```text
 zerolith  build  production, minified, one script, feedback-widget.js

  dist/feedback-widget.js  14.60 kB  gzip 5.91 kB

  built feedback-widget into dist in 31 ms
```

| What differs from building a page | |
| --- | --- |
| The name | `dist/<name>.js` with no hash, so a tag written once keeps working from one release to the next. Put a version in `--name` for a file that never changes |
| Lazy imports | Stay in the file, so nothing else is fetched and `lazy_module_not_split` does not apply |
| Exports | The module's exports are kept, so another module can import them |
| Stylesheets | A stylesheet imported with `?scoped` or a `css` literal stays in the script. Any other stylesheet goes to `dist/<name>.css`, with a warning, since the page has to link it |
| Other files | Images and fonts the code references are still written under `assets/`, with URLs from `--base` |

The file is an ES module, so a page loads it with `<script type="module">`, and from another origin only when the response sends `Access-Control-Allow-Origin`.

### Stylesheets

Stylesheets become one file. The ones the page links and the ones modules import, as in `import "./card.css"`, are combined in the order the page and the modules load them, through [lightningcss](https://lightningcss.dev): local `@import`s are inlined in place under their `layer()`, `supports()`, and media conditions, again for a stylesheet imported again under other conditions, as the browser applies it again, a remote `@import` moves to the top where CSS requires it, and the result is lowered for the oldest [supported browsers](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md), with nesting flattened, fallbacks for newer color functions, and the vendor prefixes those browsers need, then minified.

The page's first local stylesheet link loads the result, and the others are removed. A stylesheet imported with `?scoped` goes through the same steps on its own and lands in the chunk of the module that imports it, as the rules of the styles that module binds, since it applies only where a component binds it. A stylesheet link to a file that is not in the project, such as one the host serves next to the app, is kept as it is, with a warning.

### Files and URLs

Files are copied into `assets/` under a content hash when a stylesheet references them with `url()`, when a module imports them, and when the page names them in an icon, manifest, or preload `<link>`, an `<img>`, `<source>`, `<video>`, `<audio>`, or `<track>`, each candidate of a `srcset` or a preload's `imagesrcset`, or a classic `<script>`. A dependency, a file installed in `node_modules`, may refer only to installed files: a stylesheet's `url()` or `@import`, or a `?url`, `?raw`, or `?scoped` import, in a package that reaches outside `node_modules`, as `url(../../.env)` would, fails the build and names the file, so a package cannot publish a file of the project or of the disk.

A package of the workspace that `node_modules` links to counts as the project's own. Importing an image, font, media file, or document gives its URL; `?url` gives any file's URL and `?raw` its text:

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

The output folder is emptied first when it is inside the project. One outside the project, such as the static folder of a backend next to it, is written over without being emptied unless `--empty-out-dir` is passed. A folder that holds the project, that is or lies inside the public folder, or that holds a source the page loads is refused, with `..`, links, and letter case resolved first, so `--out ..` cannot reach the folder above the project. The same rules hold for `--unbundled`. The page's import map and its module preload links to local files, such as the ones `zerolith importmap` writes, are dropped, since the bundle resolves packages itself and preloads its own chunks, so a project that runs from an import map while developing builds the same way.

### Unbundled output

`--unbundled` writes the buildless output instead, for a project served with an import map in production. No bundler runs: the output is the project's modules, served as they are.

- Every file under the project is copied into the output folder, except `node_modules`, `dist`, `target`, `test`, hidden folders and files, declaration files (`*.d.ts`), and the development files: `package.json`, `tsconfig.json`, `zerolith.json`, `AGENTS.md`, `README.md`, and `*.config.*`. Two sources that would write one output file, such as `utils.ts` beside a stale `utils.js`, fail the build with both names. A folder `zerolith importmap` wrote, which its `importmap.json` marks, is copied as it is, so a package vendored by hand next to the zerolith ones keeps the integrity hash the page's map gives it; under the project's own `vendor/`, the zerolith packages and `importmap.json` are not copied, since the build writes them anew.
- `.ts`, `.tsx`, `.jsx`, and `.mts` sources are transformed to JavaScript the same way `dev` serves them and renamed to `.js`, and the relative imports that named them, static and dynamic, are rewritten to `.js`, as are the module scripts in HTML pages.
- An import of a file that is not a module works as it does under `dev`: the build points it at a small module written next to the file, such as `card.css.js`, which links the stylesheet and waits for it before the importer runs. A stylesheet imported with `?scoped` gets `card.css.scoped.js`, which holds its rules with local imports inlined; a JSON file gives its value, parsed with `JSON.parse` so a `__proto__` key stays a key; an image, a font, or a file with `?url` gives its URL; and `?raw` gives a file's text. An import that names a file outside the project fails the build, and so does one that names a file in `public/`, which is served as it is and is referenced by its URL instead.
- Every module goes through the same template prepare pass.
- Each page's import map resolves every module the build wrote to an address carrying its hash, as `/src/app.js?v=x7f2k9`, and the page names its module scripts, preloads, and stylesheets the same way, so a browser never mixes an old copy of one module with a new copy of another. The modules are served as written. An entry the page's own map holds for the same file is kept. The map's text follows the modules, so the build prints the hash a Content-Security-Policy needs to allow it.
- The installed zerolith packages, the ones `zerolith importmap` lists, are vendored into `vendor/` inside the output as `zerolith importmap --html` vendors them for a page, through the prepare pass as well: the entries the pages' modules import, with the modules they load, and every entry when no page imports one. An import map carrying integrity hashes is written into every page, nested ones such as `about/index.html` included, and each page preloads the modules its own entries load statically and the vendored modules they import. Entries the page's own import map holds for other specifiers are kept, so a third-party library mapped to a CDN or a local copy still loads; the build warns of a bare import, such as `lit`, that neither map covers, since the browser cannot load it.

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

The starter is three pages in the brand style: a home page that shows the workflow, a counter built on a named signal, and a searchable list that a resource loads from `public/data/packages.json`. It has the layout the [structure guide](structure.md) describes, a browser test with a `vitest.config.ts` that gives Vitest the zerolith plugin, `src/env.d.ts` typing `import.meta.env` and stylesheets imported with `?scoped`, an `AGENTS.md` for coding agents, and a README that walks through developing, building, previewing, deploying, environment variables, and when Vite is worth adding. Its `dev`, `build`, and `preview` scripts run the command line, or Vite with `--vite`; `--buildless` keeps `zerolith dev` and builds with `--unbundled`. The tool versions it pins are the ones this repository tests with.

`--example fullstack` writes the [fullstack example](https://github.com/molexxxx/zerolith/tree/main/examples/fullstack) as a project of its own instead: Harbor, where a small team keeps its projects and tasks, under `/app/`, with its backend in `server/`, plain Node with no dependencies, and the types, the API contract, and the validation both sides share in `shared/`. It signs members in with a session cookie, streams the team's activity to the dashboard as server-sent events, and loads a project's board as a chunk of its own.

`zerolith.json` sets the base and forwards `/api` to the backend on port 3001, so development runs two processes, `npm run api` for the backend in watch mode and `npm run dev` for `zerolith dev`, in either order, since the page asks for the session again until the backend answers; `npm run build` writes `dist/` for the base, and `npm start` serves the API and the build from the backend.

The project comes with tests of the backend in Node and of the pages in Chromium, an `AGENTS.md`, and a README on the two processes and on deploying, and pins the same versions as the starter. The example is TypeScript with `html` templates on the command line, with the inspector, so the language, dev server, and inspector questions are not asked for it, and `--template`, `--vite`, or `--buildless` given with `--example` stops the command with a message that names the flag.

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

Vendors the zerolith packages a page imports and writes the import map that loads them, so the page runs with no build step.

### What importmap writes

- The modules the page imports from the installed `zerolith`, `@zerolith/router`, `@zerolith/forms`, `@zerolith/client`, `@zerolith/a11y`, `@zerolith/state`, `@zerolith/browser`, `@zerolith/i18n`, and `@zerolith/devtools`, copied into `vendor/`, each package in a folder named for its version, as `vendor/zerolith@1.3.0/`, with its `LICENSE` and a `VERSION` file. A new version gets new addresses, so a browser's old copy never meets a new integrity hash, and the folders of other versions are removed once the pages name the new one.
- `vendor/importmap.json`.
- The import map and `modulepreload` links in the page, replaced or inserted before its first module script, keeping the page's own entries for the specifiers it does not vendor and the page's line endings.
- A `.gitattributes` in the folder that turns line ending conversion off, since a converted module fails its integrity hash, and a `.gitignore` that keeps the packages' `dist/` folders in commits whatever the project's own rules say, so `vendor/` can be committed as it is.

### What importmap follows

With `--html`, the page's module scripts are followed, inline ones included, through their relative imports, static and through `import()`, with a `.ts`, `.tsx`, `.jsx`, or `.mts` source standing in for the `.js` an import names, as `dev` serves it.

- The entries the page's modules import, such as `zerolith` and `@zerolith/router`, are mapped and vendored with the modules they load.
- The others, such as `zerolith/ssr` on a page rendered in the browser, are left out of the map.
- A package the page does not reach is left as it is on disk, neither written nor removed, so another page of the site keeps loading what its own map names.
- An `import()` of a string literal, or of a `const` the module declares with one, is followed. A module that `import()` loads by a literal path is vendored with an integrity hash and no preload link, so it still loads only when asked for.
- A page whose modules load another through an `import()` the command cannot follow, as `import(name)` with a name computed at run time, or whose module scripts import nothing from the packages, gets every entry of every package, so whatever it loads resolves, while its preload links still follow what the command found.

`--html` can be given once per page, which vendors what any of them reaches and writes each page's own preload links. After the packages change, every page of a site needs the run, since the hashes its map holds no longer match the files. A run without `--html` prints the map of every entry and the preloads those load, for the head of any page.

### Preloads, integrity, and source maps

The preload links name the modules the page's entries load statically, the entries themselves left out since the page names them, then the vendored modules the page's static imports load, so the browser fetches the page's graph in parallel instead of discovering it one import at a time.

The map carries an `integrity` entry with the SRI hash of every module reachable from the entries, so a modified file fails to load, and each preload link carries the same hash, since a browser reuses a preload only when its integrity matches the module request's.

The packages' production entries are minified one module at a time, each with a source map that embeds its TypeScript source, so the page loads small modules and the browser's developer tools still show the source. The readable modules `--development` maps come without maps, since theirs name sources that are not copied.

### Checks before importmap writes

Every package is read and checked before anything is written, so a run that a check stops leaves the vendored files as they were. These stop the command:

- a module the entries name that the installed package does not hold
- a module that does not parse
- an entry or import that leaves its package's folder
- a package folder that no earlier run wrote, which a `VERSION` file would mark

The files are then written in place. With `--html`, which moves the pages to the new map in the same run, files an earlier run left in a package's folder that the pages no longer load are removed once the pages are written, so a page write that fails leaves every file the page names; without it they stay, since the page still names them until its tags are replaced.

### Packages outside the map, and first paint

`@zerolith/otel` is not vendored, since it imports `@opentelemetry/api`; map both in the page to load it unbundled.

A page rendered in the browser still paints its static shell before the application replaces it; `blocking="render"` on the entry module script, in the document's head, holds the first paint until the module ran, as the [deploying guide](deploying.md) describes.

| Option | What it does |
| --- | --- |
| `--html <file>` | A page whose import map and preload links are replaced or inserted; once per page of the site |
| `--out <folder>` | Where the packages are copied, `vendor` by default; it is the URL prefix too |
| `--development` | Maps the readable entries with diagnostic text and the inspector instead of the minified production ones |

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
