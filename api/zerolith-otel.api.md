# @zerolith/otel

Every export of `@zerolith/otel` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function navigationObserver(tracer?: Tracer): (event: NavigationEvent) => void
function tracedHydrate(view: unknown, container: MountTarget, tracer?: Tracer): HydrateResult
function tracedTransport(transport: Transport | undefined, tracer?: Tracer): Transport
function traceparent(active?: Context): string | undefined
```
