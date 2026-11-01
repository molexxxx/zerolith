---
title: Observability
description: Spans for navigations, hydration, and requests through the OpenTelemetry API, with the tracer and the SDK left to the application.
order: 18
group: Tooling
---

# Observability

A production application wants its navigations, its hydration, and its requests in the same traces its backend already emits. `@zerolith/otel` adds those three spans through `@opentelemetry/api`, the one dependency it has beyond zerolith, and nothing else: the tracer comes from the application, backed by whatever SDK and exporter it configured, and with the API's no-op tracer every call is free. The runtime packages stay dependency-free; the router only offers an `observe` option, which this package and any other tool can use.

## Three spans

@include packages/otel/test/examples/observability.example.test.ts#spans

| Function | Span | Attributes |
| --- | --- | --- |
| `navigationObserver(tracer)` | `navigate`, from the start of a navigation to its commit, failure, or cancel | `url.path`, `url.query`, and `zerolith.navigation.mode`; on commit, `zerolith.route`; on cancel, `zerolith.navigation.canceled` |
| `tracedTransport(transport, tracer)` | A client span per request, named by method and path, as `GET /notes` | `http.request.method`, `url.full`, and `http.response.status_code` |
| `tracedHydrate(view, target, tracer)` | `hydrate`, around the call | `zerolith.hydration.mismatches`, the number of mismatches |

A span ends with an OK status when its work succeeds and an error status when it fails. A loader, a hydration, or a request that throws also records its exception on the span, and a response outside 2xx sets the error status with its code. A canceled navigation leaves the status unset, since nothing failed. The tracer argument can be left out, and each function then uses `trace.getTracer("@zerolith/otel")` from the global tracer provider.

`tracedTransport` wraps the typed client's transport, or `fetch` when it is given `undefined`, and injects a `traceparent` header from the active span, so a server that reads W3C trace context continues the browser's trace.

## Wiring an SDK

The package never chooses an SDK. In the browser, OpenTelemetry's web SDK or a vendor's registers a tracer provider with the API, and from then on `trace.getTracer("my-app")` returns a real tracer; on the server, the Node SDK does the same for server rendering.

> [!TIP]
> Until a provider is registered, the spans above cost nothing, so the package can be wired at startup unconditionally and an SDK added later without touching that code.

## Without the package

The router's `observe` option is a plain function, so logging, analytics, or a custom metric can follow navigations the same way, without OpenTelemetry. Each event carries the navigation's `id`, the same for its start and its end, its `url`, and its `mode`, which is `push`, `replace`, or `pop`:

| Event | When | Also carries |
| --- | --- | --- |
| `start` | A navigation begins | |
| `commit` | It has rendered | `name`, the matched route's name, or undefined when the fallback rendered |
| `error` | Its loader or a lazy import threw | `error` |
| `cancel` | A newer navigation replaced it before it committed | |
