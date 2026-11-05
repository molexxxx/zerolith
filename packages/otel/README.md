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

- `navigationObserver` opens a span when a navigation starts and ends it on commit, failure, or cancel, with the route name, the path, and the mode as attributes, and `zerolith.navigation.canceled` on a canceled one.
- `tracedHydrate` wraps `hydrate` in a span and records the number of mismatches.
- `tracedTransport` wraps a client transport in a client span per request, with the method, URL, and status, and injects a `traceparent` header from the active span so the server's trace continues the browser's.

The guide is on the [docs site](https://zerolith.dev/guide/observability/).

Install with `npm install @zerolith/otel`. The API is frozen at 1.0 and supported for 24 months under the [support policy](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md).

## Documentation

- The [observability guide](https://zerolith.dev/guide/observability/) explains it with examples that run as tests.
- The [reference](https://zerolith.dev/reference/zerolith-otel/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://zerolith.dev/learn/) builds an app step by step, and the [playground](https://zerolith.dev/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
