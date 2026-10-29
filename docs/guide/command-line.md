---
title: Command line
description: The Rust command line: a dev server with live reload for the buildless path, import maps with integrity hashes, and project checks.
order: 8
---

# Command line

The `zerolith` binary is written in Rust and covers the parts of development that need a process outside the browser. Build it with `cargo build --release` from the repository; it is not on crates.io yet.

## dev and serve

```
zerolith dev examples/notes --port 8080
zerolith serve dist --port 8080
```

`dev` serves the folder with directory indexes and a nearest-index fallback, so a client-side route such as `/notes/abc` loads the application's `index.html`. It injects a small module into HTML pages and announces file changes over server-sent events: a changed stylesheet is swapped in place, and any other change reloads the page. Before reloading, the client saves the values of every named signal, and the development build of zerolith restores them when signals with the same names are created again, so a form draft or a selected tab survives an edit with no build step and no component boundary.

```ts
const draft = signal("", { name: "draft" });    // restored across dev reloads
```

The server also answers `/.well-known/appspecific/com.chrome.devtools.json` on loopback, which lets Chrome DevTools edit the project's files in place.

## importmap

```
zerolith importmap --html index.html
```

Copies the installed `zerolith`, `@zerolith/router`, and `@zerolith/devtools` modules into `vendor/`, writes `vendor/importmap.json`, and replaces or inserts the import map and `modulepreload` links in the page. The map carries an `integrity` entry with the SRI hash of every module reachable from the entries, so a modified file fails to load. Pass `--development` to map the entries with diagnostic text and the inspector instead of the production ones.

## doctor

```
zerolith doctor
zerolith doctor --json
```

Reports coded findings, each with a cause and a fix: `index_missing`, `importmap_missing`, `importmap_invalid`, `importmap_target_missing`, `integrity_mismatch`, `integrity_target_missing`, `module_script_missing`, and `package_outdated`. The exit code is 1 when any finding is an error.
