# Changelog

Every package in this repository is released together and carries the same version. Entries name the packages they touch; breaking changes before 1.0.0 are called out as such.

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
- `zerolith` (crates.io): `dev` serving TypeScript and JSX through oxc, `build`, `importmap`, `doctor`, and `new`.
