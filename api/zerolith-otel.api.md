# @zerolith/otel

function navigationObserver(_): (event: NavigationEvent) => void
function tracedHydrate(view: unknown, container: MountTarget, _): HydrateResult
function tracedTransport(transport: Transport | undefined, _): Transport
function traceparent(_): string | undefined
