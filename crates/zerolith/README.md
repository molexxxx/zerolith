# zerolith (command line)

The Rust side of zerolith: a production build that bundles and minifies with Rolldown and lightningcss compiled in, a dev server that serves TypeScript and JSX as JavaScript through oxc, import map generation with integrity hashes, project checks, a scaffold for new applications, and the zerolith skill for coding agents.

```
zerolith dev [root] [--port 8080] [--base /] [--proxy /api=http://127.0.0.1:3000]   serve with live reload
zerolith serve [root] [--port 8080] [--base /] [--proxy PATH=URL]                      serve without watching
zerolith preview [root] [--out dist] [--port 4173] [--base /] [--proxy PATH=URL]
zerolith importmap [root] [--out vendor] [--development] [--html index.html]
zerolith doctor [root] [--json]
zerolith skill [root]                                                                 write the zerolith skill for coding agents
zerolith build [root] [--out dist] [--base /] [--mode production] [--sourcemap] [--no-minify] [--no-prepare] [--empty-out-dir]
zerolith build [root] --unbundled [--out dist] [--no-prepare]
zerolith new [name] [--example fullstack] [--template tsx|ts|jsx|js] [--vite] [--buildless] [--no-devtools] [--no-skill] [--no-install] [--yes]
```

Install it from npm as `@zerolith/cli`, which carries a prebuilt binary for Linux (glibc), macOS, and Windows on x64 and arm64, or from crates.io with `cargo install zerolith`.

`dev` serves a project with its package imports resolved from `node_modules` the way `build` resolves them, so the page needs no import map; TypeScript and JSX become JavaScript, and stylesheets, JSON, and other files imported from code become modules. It serves `public/` at the root, falls back to the nearest index for client-side routes, injects a small client into HTML pages, and announces file changes over server-sent events. A changed stylesheet is swapped in place; any other change reloads the page after the client saves the values of named signals, which the development build of zerolith restores on the next load. It also serves Chrome's automatic-workspace file on loopback so DevTools can edit sources in place. `--proxy` forwards a path to a backend, streaming bodies and joining WebSocket connections, so the page reaches its API on its own origin; `--base` serves the application under a path; and when the default port is taken, the next free one is used.

`zerolith.json` next to `index.html` holds what `dev`, `serve`, `build`, and `preview` share: `base`, `proxy`, `dev.port`, `preview.port`, and `build.out`. Flags override it, and `@zerolith/cli` ships its JSON schema.

`importmap` copies the installed `zerolith`, `@zerolith/router`, `@zerolith/forms`, `@zerolith/client`, and `@zerolith/devtools` modules into a vendor folder and writes an import map whose `integrity` entries hold the SRI hash of every module, plus `modulepreload` links that carry the same hashes; with `--html` it replaces or inserts them in the page.

`doctor` reports coded findings: a missing index or module script and, for a page with an import map, map targets that do not exist, integrity mismatches, preload links without their module's hash, and vendored packages older than the installed ones. It then runs the Vite plugin's template lint over the project's sources and reports the same warnings, with the file, line, and column.

`build` bundles the modules `index.html` loads into minified, tree-shaken chunks with hashed names, with Rolldown, the bundler Vite is built on: JSX lowered and every template prepared ahead of time, as in the Vite plugin, lazy routes and compiled locales in chunks of their own, the stylesheets the page links and the modules import combined into one through lightningcss, the files they reference copied under hashed names, `public/` copied as it is, and the page rewritten to load the output under any `--base`. `--unbundled` writes the buildless output instead: sources transformed to JavaScript file by file, prepared, and served with the installed packages vendored behind an import map with integrity hashes. `--no-prepare` keeps the scanner in either.

`new` writes a starter application in the brand style and installs its dependencies, asking for what the flags leave open: the starting point, the starter by default; the language, TSX by default; the command line or Vite; and the inspector. The starter has three pages, a browser test, an `AGENTS.md`, and a README on developing, building, previewing, and deploying. `--example fullstack` writes the fullstack example instead, an app under `/app/` with its own Node backend, with tests of both and a README on running the two side by side and on deploying.

From this repository, `cargo build --release` puts the binary at `target/release/zerolith`. The [command line guide](https://molexxxx.github.io/zerolith/guide/command-line/) documents every command.
