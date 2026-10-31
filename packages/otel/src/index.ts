/**
 * @zerolith/otel: spans through `@opentelemetry/api` for the three things
 * worth tracing in a zerolith application: a navigation, a hydration, and
 * a request of the typed client. The application supplies the tracer, so
 * the SDK and the exporter stay its choice, and the API's no-op tracer
 * makes every call free until one is configured.
 */
import { type Context, type Span, SpanKind, SpanStatusCode, type Tracer, context, trace } from "@opentelemetry/api";
import { type HydrateResult, type MountTarget, hydrate } from "zerolith";
import type { Transport } from "@zerolith/client";
import type { NavigationEvent } from "@zerolith/router";

/** The tracer used when none is given: the API's tracer for this package, a no-op until an SDK registers a provider. */
function defaultTracer(): Tracer
{
    return trace.getTracer("@zerolith/otel");
}

/**
 * The `observe` function for `createRouter`: a span named `navigate`
 * opens when a navigation starts and ends when it commits, fails, or is
 * canceled by a newer navigation, with `zerolith.route`, `url.path`, and
 * `zerolith.navigation.mode` as attributes, the loader's error recorded on
 * failure, and `zerolith.navigation.canceled` set on a canceled one, whose
 * status stays unset.
 */
export function navigationObserver(tracer: Tracer = defaultTracer()): (event: NavigationEvent) => void
{
    const open = new Map<number, Span>();
    return (event) =>
    {
        if (event.type === "start")
        {
            const span = tracer.startSpan("navigate", {
                kind: SpanKind.INTERNAL,
                attributes: { "url.path": event.url.pathname, "url.query": event.url.search, "zerolith.navigation.mode": event.mode }
            });
            open.set(event.id, span);
            return;
        }
        const span = open.get(event.id);
        if (span === undefined)
        {
            return;
        }
        open.delete(event.id);
        if (event.type === "commit")
        {
            span.setAttribute("zerolith.route", event.name ?? "");
            span.setStatus({ code: SpanStatusCode.OK });
        }
        else if (event.type === "cancel")
        {
            span.setAttribute("zerolith.navigation.canceled", true);
        }
        else
        {
            const error = event.error;
            span.recordException(error instanceof Error ? error : new Error(String(error)));
            span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
        }
        span.end();
    };
}

/** `hydrate` inside a span named `hydrate`, with the number of mismatches as `zerolith.hydration.mismatches`. */
export function tracedHydrate(view: unknown, container: MountTarget, tracer: Tracer = defaultTracer()): HydrateResult
{
    return tracer.startActiveSpan("hydrate", (span) =>
    {
        try
        {
            const result = hydrate(view, container);
            span.setAttribute("zerolith.hydration.mismatches", result.mismatches.length);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        }
        catch (error)
        {
            span.recordException(error instanceof Error ? error : new Error(String(error)));
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
        }
        finally
        {
            span.end();
        }
    });
}

/** The W3C `traceparent` header for a context, or undefined when no span is active in it. */
export function traceparent(active: Context = context.active()): string | undefined
{
    const span = trace.getSpanContext(active);
    if (span === undefined || !trace.isSpanContextValid(span))
    {
        return undefined;
    }
    return `00-${span.traceId}-${span.spanId}-${span.traceFlags.toString(16).padStart(2, "0")}`;
}

/**
 * Wraps a transport, or `fetch` when none is given, so every request runs
 * in a client span named `METHOD /path` with `http.request.method`,
 * `url.full`, and `http.response.status_code`, carries a `traceparent`
 * header from that span, and records a failed request as an error.
 */
export function tracedTransport(transport: Transport | undefined, tracer: Tracer = defaultTracer()): Transport
{
    const send: Transport = transport ?? ((request) => fetch(request));
    return (request) =>
    {
        const url = new URL(request.url);
        return tracer.startActiveSpan(`${request.method} ${url.pathname}`, { kind: SpanKind.CLIENT, attributes: { "http.request.method": request.method, "url.full": request.url } }, async (span) =>
        {
            try
            {
                const header = traceparent();
                const traced = header === undefined ? request : new Request(request, { headers: withHeader(request.headers, "traceparent", header) });
                const response = await send(traced);
                span.setAttribute("http.response.status_code", response.status);
                span.setStatus(response.ok ? { code: SpanStatusCode.OK } : { code: SpanStatusCode.ERROR, message: `HTTP ${response.status}` });
                return response;
            }
            catch (error)
            {
                span.recordException(error instanceof Error ? error : new Error(String(error)));
                span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
                throw error;
            }
            finally
            {
                span.end();
            }
        });
    };
}

function withHeader(headers: Headers, name: string, value: string): Headers
{
    const copy = new Headers(headers);
    copy.set(name, value);
    return copy;
}
