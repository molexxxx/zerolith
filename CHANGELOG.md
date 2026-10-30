# Changelog

Every package in this repository is released together and carries the same version. Entries name the packages they touch; breaking changes before 1.0.0 are called out as such.

## Unreleased

- `zerolith`: `render` and `hydrate` take a CSS selector for the container as well as an element, expose the element as `container` on the root, and report a selector that matches nothing as `mount_target_missing`. The `@zerolith/vite` runtime and `tracedHydrate` in `@zerolith/otel` take the same targets.
- `zerolith`: `prepared` registers a template's scan made ahead of time, `scan` is exported for build tools, and `template_not_prepared` reports a template a scanner-free bundle never saw.
- `@zerolith/vite`: the template prepare pass runs in `vite build`, scanning every `html` literal at build time and dropping the scanner from the bundle; `prepare: false` keeps the old behavior.
- `zerolith`: `DIAGNOSTIC_URL` and every diagnostic link point at the docs on GitHub Pages, `https://molexxxx.github.io/zerolith/e/`, until the project's own domain is registered; the Vite plugin's warnings and the command line use the same address.
- `@zerolith/cli` and the `zerolith` crate: `build` runs the same prepare pass over the project's modules and the vendored packages, with the scanner replaced by its stand-in, and is held to the Vite plugin's output by a shared fixture.

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
