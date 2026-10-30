---
title: Command line
description: "The Rust command line: a dev server with live reload for the buildless path, import maps with integrity hashes, and project checks."
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

## importmap

```
zerolith importmap --html index.html
```

Copies the installed `zerolith`, `@zerolith/router`, `@zerolith/forms`, `@zerolith/client`, and `@zerolith/devtools` modules into `vendor/`, writes `vendor/importmap.json`, and replaces or inserts the import map and `modulepreload` links in the page. The map carries an `integrity` entry with the SRI hash of every module reachable from the entries, so a modified file fails to load. Pass `--development` to map the entries with diagnostic text and the inspector instead of the production ones.

## doctor

```
zerolith doctor
zerolith doctor --json
```

Reports coded findings, each with a cause and a fix: `index_missing`, `importmap_missing`, `importmap_invalid`, `importmap_target_missing`, `integrity_mismatch`, `integrity_target_missing`, `module_script_missing`, and `package_outdated`. The exit code is 1 when any finding is an error.

## new

```
zerolith new my-app
zerolith new my-app --js
zerolith new my-app --buildless
```

Writes the application layout the [structure guide](/guide/structure/) describes, with a working first page, the scripts, and an `AGENTS.md`, pinning the tool versions this repository tests with. The default is Vite and TypeScript; `--js` keeps Vite with JavaScript and JSDoc types; `--buildless` writes an import map instead of a bundler configuration, filled by `zerolith importmap` after `npm install`, with TypeScript sources that `zerolith dev` serves and `zerolith build` writes out for static hosting.

## build

```
zerolith build . --out dist
```

The production output of a buildless project, for any static host. Every file under the project is copied into the output folder, except `node_modules`, `vendor`, `dist`, `target`, `test`, hidden folders and files, and the development files (`package.json`, `tsconfig.json`, `AGENTS.md`, `README.md`, and `*.config.*`); `.ts`, `.tsx`, `.jsx`, and `.mts` sources are transformed to JavaScript the same way `dev` serves them and renamed to `.js`; relative imports that named those files, static and dynamic, are rewritten to `.js`, and so are the module scripts in HTML pages. Every module then goes through the template prepare pass the [Vite plugin](/guide/vite/) runs in `vite build`: each `html` literal is scanned ahead of time and registered next to the literal, so the browser binds templates without scanning them, and a template the scanner refuses fails the build at its line. The installed packages are then vendored into `vendor/` inside the output with an import map carrying integrity hashes, written into every page at the output's root; the vendored modules go through the same pass, and the core's scanner is replaced by a stand-in that reports `template_not_prepared`, so the scanner is not shipped. A module that uses `html` from zerolith other than as a template tag, or re-exports it, fails the build at its line and column, since a template tagged through it would reach the browser unprepared; `--no-prepare` keeps the scanner and leaves every literal as it is. No bundler runs: the output is the project's modules, served as they are, which is what the buildless path promises.
