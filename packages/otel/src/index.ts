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

/** The query keys whose values the URL conventions redact by default, such as a signed URL's signature. */
const SENSITIVE_QUERY = new Set(["X-Amz-Signature", "X-Amz-Credential", "X-Amz-Security-Token", "sig", "X-Goog-Signature"]);

/** A URL's query component without its `?`, with the value of each key the conventions redact replaced by `REDACTED`. */
function redactedQuery(search: string): string
{
    return search.replace(/^\?/, "").split("&").map((pair) =>
    {
        const key = pair.split("=", 1)[0] ?? "";
        return SENSITIVE_QUERY.has(key) ? `${key}=REDACTED` : pair;
    }).join("&");
}

/**
 * The `observe` function for `createRouter`: a span named `navigate`
 * opens when a navigation starts and ends when it commits, fails, or is
 * canceled by a newer navigation, with `zerolith.route`, `url.path`,
 * `url.query` when the URL has a query, and `zerolith.navigation.mode` as
 * attributes, the loader's error recorded on failure, and
 * `zerolith.navigation.canceled` set on a canceled one, whose status stays
 * unset. The values of the query keys the URL conventions redact, such as
 * `sig`, are recorded as `REDACTED`.
 */
export function navigationObserver(tracer: Tracer = defaultTracer()): (event: NavigationEvent) => void
{
    const open = new Map<number, Span>();
    return (event) =>
    {
        if (event.type === "start")
        {
            const query = redactedQuery(event.url.search);
            const span = tracer.startSpan("navigate", {
                kind: SpanKind.INTERNAL,
                attributes: { "url.path": event.url.pathname, ...(query === "" ? {} : { "url.query": query }), "zerolith.navigation.mode": event.mode }
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
 * in a client span named by its method, as `GET`, with
 * `http.request.method`, `url.full`, and `http.response.status_code`,
 * carries a `traceparent` header from that span, and records a failed
 * request as an error. The span is not named by the request's path, which
 * would give every note its own span name; the HTTP conventions name a
 * client span by its method when no route template is known. `url.full`
 * records the values of the query keys the conventions redact, such as
 * `sig`, as `REDACTED`.
 */
export function tracedTransport(transport: Transport | undefined, tracer: Tracer = defaultTracer()): Transport
{
    const send: Transport = transport ?? ((request) => fetch(request));
    return (request) =>
    {
        const full = new URL(request.url);
        full.search = redactedQuery(full.search);
        return tracer.startActiveSpan(request.method, { kind: SpanKind.CLIENT, attributes: { "http.request.method": request.method, "url.full": full.href } }, async (span) =>
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
