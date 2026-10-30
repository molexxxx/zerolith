# Changelog

Every package in this repository is released together and carries the same version. Entries name the packages they touch; breaking changes before 1.0.0 are called out as such.

## Unreleased

- `@zerolith/vite`, `@zerolith/cli`, and the `zerolith` crate: the prepare pass creates a template with no bindings once, at module scope, and every render reuses that view instead of allocating a new one.

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
