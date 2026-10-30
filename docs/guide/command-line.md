---
title: Command line
description: "The Rust command line: production builds bundled with Rolldown, a dev server with live reload, import maps with integrity hashes, and project checks."
order: 11
---

# Command line

The `zerolith` binary is written in Rust and covers the parts of development that need a process outside the browser. It installs from npm as `@zerolith/cli`, a thin package whose optional dependencies carry a prebuilt binary for Linux (glibc), macOS, and Windows on x64 and arm64, so `npm install --save-dev @zerolith/cli@alpha` followed by `npx zerolith` works wherever npm does, and `zerolith new` writes that dependency into the scaffold. Elsewhere, and on musl systems such as Alpine, `cargo install zerolith` builds the same crate from crates.io and `ZEROLITH_BINARY_PATH` tells the npm shim where it is.

## dev and serve

```
zerolith dev examples/notes --port 8080
zerolith serve dist --port 8080
```

`dev` serves the folder with directory indexes and a nearest-index fallback, so a client-side route such as `/notes/abc` loads the application's `index.html`. TypeScript and JSX need no build step either: a request for a `.ts`, `.tsx`, or `.jsx` file is answered with JavaScript, types stripped through oxc and JSX lowered to the same `html` calls the Vite plugin produces, and an import of `./app.js` whose file is `app.ts` resolves to it, so a project can keep TypeScript sources and still run from an import map while developing. It injects a small module into HTML pages and announces file changes over server-sent events: a changed stylesheet is swapped in place, and any other change reloads the page. Before reloading, the client saves the values of every named signal, and the development build of zerolith restores them when signals with the same names are created again, so a form draft or a selected tab survives an edit with no build step and no component boundary. Under Vite, the plugin in `@zerolith/vite` does the same restore without reloading the page; see [Vite](/guide/vite/).

```ts
const draft = signal("", { name: "draft" });    // restored across dev reloads
```

The server also answers `/.well-known/appspecific/com.chrome.devtools.json` on loopback, which lets Chrome DevTools edit the project's files in place.

## build

```
zerolith build
zerolith build --base /app/ --out ../server/static
zerolith build --unbundled
```

Bundles the application for production with [Rolldown](https://rolldown.rs), the bundler Vite is built on, compiled into the binary: no Node tooling runs and nothing else needs installing. The build starts from `index.html`. Every `<script type="module" src="...">` with a local source is an entry, and the modules it imports, TypeScript, TSX, JSX, and JavaScript alike, are bundled into minified, tree-shaken chunks under `assets/`, each with a content hash in its name so a host can cache it forever. Packages resolve from `node_modules`, with the production build of zerolith; `--mode` with any other name, such as `--mode staging`, resolves the development build with its diagnostic text instead. The command prints every file it wrote:

```
zerolith: built . into dist in 63 ms
  assets/de-DWUa6-jV.js           1.69 kB
  assets/en-BR-GMg9l.js           1.62 kB
  assets/index-GOwJAoK8.js       45.27 kB
  assets/index-a01166d1.css       0.81 kB
  index.html                      0.57 kB
```

The zerolith passes are the ones `vite build` runs through the [Vite plugin](/guide/vite/), held to the same output by shared fixtures. JSX is lowered to `html` calls. Every module goes through the template prepare pass: each `html` literal is scanned ahead of time and registered next to the literal, a template with no bindings is created once at module scope, and the core's scanner is replaced by a stand-in that reports `template_not_prepared`, so the browser binds templates without scanning them and the scanner is not shipped. A template the scanner refuses fails the build at its line, and so does a module that uses `html` from zerolith other than as a template tag; `--no-prepare` keeps the scanner and leaves every literal as it is.

A view loaded with the router's `lazy()` and each locale of a message index compiled by `zerolith-i18n` get chunks of their own, fetched when they are needed, and the build fails with `lazy_module_not_split` when one of them is also imported statically, which would merge it into the importing chunk. A module that an entry and a lazy chunk share gets a chunk both import. The page preloads every chunk its entries import statically with `<link rel="modulepreload">`, so the browser fetches them in parallel instead of discovering them one import at a time.

Stylesheets become one file. The ones the page links and the ones modules import, as in `import "./card.css"`, are combined in the order the page and the modules load them, through [lightningcss](https://lightningcss.dev): local `@import`s are inlined in place under their `layer()`, `supports()`, and media conditions, a remote `@import` moves to the top where CSS requires it, and the result is lowered for the oldest [supported browsers](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md), with nesting flattened, fallbacks for newer color functions, and the vendor prefixes those browsers need, then minified. The page's first local stylesheet link loads the result, and the others are removed.

Files are copied into `assets/` under a content hash when a stylesheet references them with `url()`, when a module imports them, and when the page names them in an icon, manifest, or preload `<link>`, an `<img>`, `<source>`, `<video>`, `<audio>`, or `<track>`, or a classic `<script>`. Importing an image, font, media file, or document gives its URL; `?url` gives any file's URL and `?raw` its text:

```ts
import logo from "./logo.svg";
import license from "../LICENSE?raw";
```

A root-absolute URL such as `/favicon.svg` is looked up in `public/` first. The files in `public/` are copied into the output as they are and keep their URLs, so files that need a fixed name, such as `robots.txt`, a web manifest, and the favicon, go there.

`--base` sets the public path the application is served under, and every URL the build writes uses it: `--base /app/` for an application a backend or a reverse proxy serves under `/app/`, and `--base ./` for URLs relative to the page, for a page opened from disk or embedded at a path not known in advance. Modules read the mode and the base as `import.meta.env.MODE`, `import.meta.env.DEV`, `import.meta.env.PROD`, and `import.meta.env.BASE_URL`, which the build replaces with their values, as it replaces `process.env.NODE_ENV` for packages written for Node bundlers.

The output keeps ES2022 syntax as written. Lowering class fields for the oldest supported browsers would turn every field into a function call, slowing every class, so class static blocks need Chrome 94 and `#field in` checks Chrome 91; newer syntax, such as `using` declarations, is lowered. As in Vite, the `paths` of a `tsconfig.json` do not take part in resolution; give a module an alias through the `imports` field of `package.json` instead, which TypeScript, Node, and the build all read.

The output folder, `dist` unless `--out` names another, is emptied first when it is inside the project. One outside the project, such as the static folder of a backend next to it, is written over without being emptied unless `--empty-out-dir` is passed, and a folder that holds the project or a source the page loads is refused. `--sourcemap` writes a source map next to each chunk, and `--no-minify` keeps names and whitespace while still removing dead code. The page's import map and its module preload links to local files, such as the ones `zerolith importmap` writes, are dropped, since the bundle resolves packages itself and preloads its own chunks, so a project that runs from an import map while developing builds the same way.

`--unbundled` writes the buildless output instead, for a project served with an import map in production. Every file under the project is copied into the output folder, except `node_modules`, `vendor`, `dist`, `target`, `test`, hidden folders and files, and the development files (`package.json`, `tsconfig.json`, `AGENTS.md`, `README.md`, and `*.config.*`); `.ts`, `.tsx`, `.jsx`, and `.mts` sources are transformed to JavaScript the same way `dev` serves them and renamed to `.js`; relative imports that named those files, static and dynamic, are rewritten to `.js`, and so are the module scripts in HTML pages. Every module goes through the same template prepare pass, and the installed packages are vendored into `vendor/` inside the output with an import map carrying integrity hashes, written into every page at the output's root; the vendored modules go through the pass as well. No bundler runs: the output is the project's modules, served as they are.

## new

```
zerolith new my-app
zerolith new my-app --js
zerolith new my-app --buildless
```

Writes the application layout the [structure guide](/guide/structure/) describes, with a working first page, the scripts, and an `AGENTS.md`, pinning the tool versions this repository tests with. The default is Vite and TypeScript; `--js` keeps Vite with JavaScript and JSDoc types; `--buildless` writes an import map instead of a bundler configuration, filled by `zerolith importmap` after `npm install`, with TypeScript sources that `zerolith dev` serves and `zerolith build --unbundled` writes out file by file for static hosting.

## importmap

```
zerolith importmap --html index.html
```

Copies the installed `zerolith`, `@zerolith/router`, `@zerolith/forms`, `@zerolith/client`, and `@zerolith/devtools` modules into `vendor/`, writes `vendor/importmap.json`, and replaces or inserts the import map and `modulepreload` links in the page. The map carries an `integrity` entry with the SRI hash of every module reachable from the entries, so a modified file fails to load, and each preload link carries the same hash, since a browser reuses a preload only when its integrity matches the module request's. Pass `--development` to map the entries with diagnostic text and the inspector instead of the production ones.

## doctor

```
zerolith doctor
zerolith doctor --json
```

Reports coded findings, each with a cause and a fix: `index_missing`, `importmap_missing`, `importmap_invalid`, `importmap_target_missing`, `integrity_mismatch`, `integrity_target_missing`, `preload_integrity_mismatch`, `module_script_missing`, and `package_outdated`. The exit code is 1 when any finding is an error.

It then runs the template lint of the [Vite plugin](/guide/vite/) over the project's `.js`, `.ts`, `.jsx`, and `.tsx` sources, outside `node_modules`, `vendor`, `dist`, `target`, test folders, and hidden folders, and reports the same warnings with the file, line, and column: `template_frozen_read`, `image_without_alt`, `button_without_name`, and `frame_without_title`. JSX is lowered first, keeping its lines, so a finding in a `.tsx` file points at the line its element starts on. A shared fixture holds the two implementations to the same findings.
