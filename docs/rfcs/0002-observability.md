# 0002: Observability through the OpenTelemetry API

Date: 2026-10-29. Status: accepted on 2026-10-29 by the project lead's delegation; shipped on main the same day.

## Problem

An application in production needs to know how long a navigation took, whether hydration happened and how long it held the page, and which request to which server failed, in the same traces its backend already emits. Every framework answers this by hand, and the research report found the industry settled on one API: SvelteKit declares `@opentelemetry/api` as a peer, Sentry documents fifteen frameworks against it, and OpenTelemetry's browser SDK instruments navigation and route changes. The report's direction is to emit spans through `@opentelemetry/api` only, as an optional peer, never through an SDK the framework would pick for the user.

The runtime packages carry no dependencies and no peer dependencies, by rule, so the spans cannot live in the core, the router, or the client.

## Proposal

A separate package, `@zerolith/otel`, with `@opentelemetry/api` as its only peer dependency next to `zerolith`, accepting the 1.9 and 1.10 lines, because the current tracing SDK still declares a peer range below 1.10. It adds no span unless the application installs it, and when it does, it adds exactly three kinds:

- A navigation span per route change: `navigationObserver(tracer)` returns the `observe` function the router accepts, so a span opens when a navigation starts and ends when it commits or fails, with the route name, the path, and the mode as attributes and the error recorded on failure.
- A hydration span: `tracedHydrate(view, container, tracer)` wraps `hydrate` and records the number of mismatches as an attribute.
- A server-call span per request of the typed client: `tracedTransport(transport, tracer)` wraps a `Transport`, opens a client span with the method, URL, and status code, and injects a `traceparent` header built from the active span so the server's trace continues the browser's.

The router gains one option, `observe`, a function receiving `{ type: "start" | "commit" | "error", id, url, mode, name?, error? }`. It is the hook the package uses, and any other tool can use it the same way; the router still has no dependency.

The tracer comes from the application: `trace.getTracer("my-app")` from the API, backed by whatever SDK and exporter the application configured. Without an SDK the API's no-op tracer makes every call free, which is the behavior the report asks for.

## Alternatives considered

- Spans in the runtime packages behind a feature flag: rejected by the dependency rule and by the size budget; the API package is not small.
- A custom event bus the application bridges to its tracing: it is what `observe` already is for the router, and the package is that bridge, written once.
- Supporting the browser SDK directly: it is experimental, and choosing an SDK for the application is a decision the application owns.

## Migration

None; the package is new and the router option is additive.

## Effect on size and on the agent index

Zero bytes in the runtime packages. The router's `observe` option is one call per navigation. The agent index gains the package's three functions and the router option.
