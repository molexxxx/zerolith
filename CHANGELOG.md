# Changelog

Every package in this repository is released together and carries the same version. Entries name the packages they touch; breaking changes before 1.0.0 are called out as such.

## Unreleased

### Breaking changes

- `@zerolith/vite`: a client build fails with `lazy_module_not_split` when a view loaded with the router's `lazy()`, or a locale module of a message index compiled by `zerolith-i18n`, is also imported statically, which would put it in the importing chunk instead of a chunk of its own. Server builds are not checked.
- `@zerolith/cli` and the `zerolith` crate: `zerolith build` bundles the application instead of writing it file by file. The previous output, sources transformed one by one and served with the packages vendored behind an import map, is `zerolith build --unbundled`, which `zerolith new --buildless` now writes into the project's build script.

### Added

- `@zerolith/cli` and the `zerolith` crate: `zerolith build` bundles with Rolldown and lightningcss compiled into the binary, with no Node tooling. The modules `index.html` loads become minified, tree-shaken chunks with content hashes in their names; lazy route views and compiled locales get chunks of their own, under the same `lazy_module_not_split` check as the Vite plugin; JSX is lowered and every template prepared as in `vite build`; the stylesheets the page links and the modules import become one file, with local `@import`s inlined under their conditions and the result lowered for the supported browsers; imported and referenced files are copied under hashed names, `?url` and `?raw` imports included; `public/` is copied as it is; and the page is rewritten to load the output, with its static imports preloaded. `--base`, `--mode`, `--sourcemap`, `--no-minify`, and `--empty-out-dir` configure it, and `import.meta.env` carries the mode and the base.
- `@zerolith/cli` and the `zerolith` crate: `zerolith dev` resolves package imports from `node_modules` with the resolver and conditions `zerolith build` uses, so a page needs one module script and no import map, and serves packages that live outside the project folder, such as workspace packages, under `/@fs/`. Stylesheets, JSON, and other files imported from code become modules as in the build, a CommonJS package is reported by name, and `public/` is served at the root.
- `@zerolith/cli` and the `zerolith` crate: `zerolith preview` serves a build's output folder as a static host would.
- `@zerolith/cli` and the `zerolith` crate: `import.meta.env` carries the mode, the base, and every variable named with the `PUBLIC_` prefix from `.env` files and the environment, in `zerolith dev` and `zerolith build` alike; other variables never reach the browser.
- `@zerolith/cli` and the `zerolith` crate: `zerolith doctor` runs the template lint of the Vite plugin over the project's sources and reports the same warnings, with the file, line, and column; a shared fixture holds both implementations to the same findings.

### Changed

- `@zerolith/vite`, `@zerolith/cli`, and the `zerolith` crate: the prepare pass creates a template with no bindings once, at module scope, and every render reuses that view instead of allocating a new one.

### Fixed

- `zerolith` and `@zerolith/devtools`: opening the inspector from its launcher or with Alt+Shift+Z froze the page. Nodes the inspector created after it mounted counted as the application's, so every refresh listed them and created more. What the inspector's effects and owners create is now internal however late it is created, and internal nodes, roots, and effect runs are not announced to subscribers.

## 0.1.0-alpha.2 (2026-10-30)

Templates are prepared at build time by the Vite plugin and the command line, views mount by CSS selector, and every diagnostic links to a page that exists: the docs site is published to GitHub Pages with each release.

### Breaking changes

- `zerolith`: `DIAGNOSTIC_URL`, and with it the link in every diagnostic, moves from `https://zerolith.dev/e/` to `https://molexxxx.github.io/zerolith/e/`, where the pages are published. The old address never resolved; the links move once more when the project registers its own domain.
- `@zerolith/vite`: `vite build` runs the template prepare pass by default, and a module that uses `html` from zerolith other than as a template tag, or re-exports it, fails the build at its line. `prepare: false` keeps the previous behavior.
- `@zerolith/cli` and the `zerolith` crate: `zerolith build` runs the same pass with the same refusals. `--no-prepare` keeps the previous behavior.

### Added

- `zerolith`: `render` and `hydrate` take a CSS selector for the container as well as an element, the root exposes the element it mounted into as `container`, and a selector that matches nothing reports `mount_target_missing`. The `@zerolith/vite` runtime and `tracedHydrate` in `@zerolith/otel` take the same targets.
- `zerolith`: `prepared` registers a template's scan made ahead of time, `scan` is exported for build tools, and `template_not_prepared` reports a template that a bundle without the scanner was never given.
- `@zerolith/vite`: the template prepare pass scans every `html` literal at build time, so the browser binds templates without scanning them and the scanner leaves the bundle.
- `@zerolith/cli` and the `zerolith` crate: `build` runs the prepare pass over the project's modules and the vendored packages and puts the scanner's stand-in in its place, held to the Vite plugin's output by a shared fixture.

### Fixed

- `@zerolith/cli` and the `zerolith` crate: `importmap` and `build` write each module's integrity hash on its preload link. Without it the browser could not use the preloads, because the import map gives the module requests that hash, and downloaded every vendored module twice. `doctor` warns about a page whose preload links lack it, under `preload_integrity_mismatch`.
- `@zerolith/cli` and the `zerolith` crate: `zerolith new` lists `@zerolith/test` and `@zerolith/vite` as development dependencies.
- `@zerolith/cli` and the `zerolith` crate: the usage text names the command `zerolith` on every platform instead of the executable file name.
- Every package: the `latest` dist-tag follows the newest pre-release until a stable version exists, so `npm install zerolith` no longer stays on `0.1.0-alpha.1`.

## 0.1.0-alpha.1 (2026-10-29)

The first published alpha. The API is not frozen: minor versions may change it until 1.0.0, and the `alpha` dist-tag marks that.

- `zerolith`: signals, `html` and `css` templates, fine-grained rendering, hydration, server rendering (`zerolith/ssr`), coded diagnostics with a catalog, custom elements (`zerolith/element`), the JSX types (`zerolith/jsx-runtime`), and the dev tools hook.
- `@zerolith/router`: the typed route table, loaders, head metadata, scroll restoration, the server entry (`@zerolith/router/server`) with embedded route data, and the `observe` hook.
- `@zerolith/forms`: native forms enhanced with `fetch`, RFC 9457 problem details with a `fields` map, and Standard Schema validation shared with the server.
- `@zerolith/client`: a typed client over a generated OpenAPI contract (`zerolith-client`), with a message port transport.
- `@zerolith/test`: mount with cleanup, settle, hydration mismatches, and accessibility issues.
- `@zerolith/a11y`: focus trap, roving tabindex, live announcer, focus origin, visually hidden styles, and media query signals.
- `@zerolith/i18n`: locale negotiation and state on `Intl`, formatters, and the MessageFormat 2 compiler (`zerolith-i18n`).
- `@zerolith/otel`: navigation, hydration, and request spans through `@opentelemetry/api`.
- `@zerolith/devtools`: the in-page inspector.
- `@zerolith/vite`: JSX lowering, hot replacement with named-signal restore, the production build check, and development warnings.
- `@zerolith/cli` and the `zerolith` crate: `dev` serving TypeScript and JSX through oxc, `build`, `importmap`, `doctor`, and `new`; npm installs a prebuilt binary through one optional platform package per target (Linux, macOS, and Windows on x64 and arm64).
