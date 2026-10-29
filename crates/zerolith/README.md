# zerolith (command line)

The Rust side of zerolith: a dev server for the buildless path, import map generation with integrity hashes, project checks, and a scaffold for new applications.

```
zerolith dev [root] [--port 8080]       serve with live reload
zerolith serve [root] [--port 8080]     serve without watching
zerolith importmap [root] [--out vendor] [--development] [--html index.html]
zerolith doctor [root] [--json]
```

`dev` serves files under the root with directory indexes and a nearest-index fallback for client-side routes, injects a small client into HTML pages, and announces file changes over server-sent events. A changed stylesheet is swapped in place; any other change reloads the page after the client saves the values of named signals, which the development build of zerolith restores on the next load. It also serves Chrome's automatic-workspace file on loopback so DevTools can edit sources in place.

`importmap` copies the installed `zerolith`, `@zerolith/router`, `@zerolith/forms`, `@zerolith/client`, and `@zerolith/devtools` modules into a vendor folder and writes an import map whose `integrity` entries hold the SRI hash of every module, plus `modulepreload` links; with `--html` it replaces or inserts them in the page.

`doctor` reports coded findings: a missing index or import map, map targets that do not exist, integrity mismatches, a missing module script, and vendored packages older than the installed ones.

`new` writes the standard application layout with a working first page, the scripts, and an `AGENTS.md`: Vite and TypeScript by default, `--js` for JavaScript with JSDoc types, `--buildless` for an import map and no bundler.

Build with `cargo build --release`; the binary is `target/release/zerolith`. Nothing is published to crates.io yet.
