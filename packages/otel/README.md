# @zerolith/otel

Spans for zerolith applications through `@opentelemetry/api`, the one dependency this package has beyond zerolith. It adds nothing unless installed, and with the API's no-op tracer it costs nothing until an SDK is configured.

```ts
import { trace } from "@opentelemetry/api";
import { navigationObserver, tracedHydrate, tracedTransport } from "@zerolith/otel";

const tracer = trace.getTracer("my-app");
const router = createRouter(appRoutes, { observe: navigationObserver(tracer) });
const api = createClient<Api>(apiRoutes, { transport: tracedTransport(undefined, tracer) });
tracedHydrate(App(router), "#app", tracer);
```

- `navigationObserver` opens a span when a navigation starts and ends it on commit or failure, with the route name, the path, and the mode as attributes.
- `tracedHydrate` wraps `hydrate` in a span and records the number of mismatches.
- `tracedTransport` wraps a client transport in a client span per request, with the method, URL, and status, and injects a `traceparent` header from the active span so the server's trace continues the browser's.

The guide is on the [docs site](https://molexxxx.github.io/zerolith/guide/observability/).

Status: alpha. Install with `npm install @zerolith/otel@alpha`; the API may change before 1.0.

## Documentation

- The [observability guide](https://molexxxx.github.io/zerolith/guide/observability/) explains it with examples that run as tests.
- The [reference](https://molexxxx.github.io/zerolith/reference/zerolith-otel/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://molexxxx.github.io/zerolith/learn/) builds an app step by step, and the [playground](https://molexxxx.github.io/zerolith/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
