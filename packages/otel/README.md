# @zerolith/otel

Spans for zerolith applications through `@opentelemetry/api`, the one dependency this package has beyond zerolith. It adds nothing unless installed, and with the API's no-op tracer it costs nothing until an SDK is configured.

```ts
import { trace } from "@opentelemetry/api";
import { navigationObserver, tracedHydrate, tracedTransport } from "@zerolith/otel";

const tracer = trace.getTracer("my-app");
const router = createRouter(routes, { observe: navigationObserver(tracer) });
const api = createClient<Api>(routes, { transport: tracedTransport(undefined, tracer) });
tracedHydrate(App(router), document.getElementById("app") as HTMLElement, tracer);
```

- `navigationObserver` opens a span when a navigation starts and ends it on commit or failure, with the route name, the path, and the mode as attributes.
- `tracedHydrate` wraps `hydrate` in a span and records the number of mismatches.
- `tracedTransport` wraps a client transport in a client span per request, with the method, URL, and status, and injects a `traceparent` header from the active span so the server's trace continues the browser's.

The guide is `docs/guide/observability.md` in the repository.

Status: pre-alpha, nothing published.

## License

Apache-2.0. See `LICENSE`.
