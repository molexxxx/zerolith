<!-- Generated from docs/guide/observability.md by npm run skills. Edit the guide, then regenerate. -->

# Observability

A production application wants its navigations, its hydration, and its requests in the same traces its backend already emits. `@zerolith/otel` adds those three spans through `@opentelemetry/api`, the one dependency it has beyond zerolith, and nothing else: the tracer comes from the application, backed by whatever SDK and exporter it configured, and with the API's no-op tracer every call is free. The runtime packages stay dependency-free; the router only gained an `observe` option, which this package and any other tool can use.

## Three spans

```ts
import { trace } from "@opentelemetry/api";
import { createClient } from "@zerolith/client";
import { navigationObserver, tracedTransport } from "@zerolith/otel";
import { createRouter } from "@zerolith/router";
import { type Api, routes as apiRoutes } from "./notes.api.ts";

const tracer = trace.getTracer("notes");

const router = createRouter(routes, { observe: navigationObserver(tracer) });
const api = createClient<Api>(apiRoutes, {
    baseUrl: "https://notes.example",
    transport: tracedTransport(fetch, tracer)
});

await router.navigate("/");             // a "navigate" span
await api.call("listNotes");            // a "GET /notes" span and a traceparent header
```

- `navigationObserver(tracer)` opens a span named `navigate` when a navigation starts and ends it on commit or failure, with the path, the query, the mode, and the matched route's name as attributes and the loader's error recorded.
- `tracedTransport(transport, tracer)` wraps the typed client's transport, or `fetch` when none is given, in a client span per request named by method and path, with the status code, and injects a `traceparent` header from the active span, so a server that reads W3C trace context continues the browser's trace.
- `tracedHydrate(view, container, tracer)` wraps `hydrate` in a span that records the number of mismatches.

## Wiring an SDK

The package never chooses an SDK. In the browser, OpenTelemetry's web SDK or a vendor's registers a tracer provider with the API, and from then on `trace.getTracer("my-app")` returns a real tracer; on the server, the Node SDK does the same for server rendering. Until one is registered, the spans above cost nothing, which is why the package can be wired at startup unconditionally.

The `observe` option on the router is a plain function receiving `start`, `commit`, `error`, and `cancel` events with one id per navigation, `cancel` for one a newer navigation replaced before it committed, so logging, analytics, or a custom metric can attach the same way without this package.
