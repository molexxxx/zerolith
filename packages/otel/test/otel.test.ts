import { SpanStatusCode, context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { html } from "zerolith";
import { createClient } from "@zerolith/client";
import { navigationObserver, traceparent, tracedTransport } from "@zerolith/otel";
import { createRouter, defineRoutes, route } from "@zerolith/router";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
const manager = new AsyncLocalStorageContextManager();

beforeAll(() =>
{
    manager.enable();
    context.setGlobalContextManager(manager);
    trace.setGlobalTracerProvider(provider);
});

afterAll(async () =>
{
    await provider.shutdown();
    context.disable();
    trace.disable();
});

beforeEach(() =>
{
    exporter.reset();
});

const tracer = trace.getTracer("test");

describe("navigationObserver", () =>
{
    it("spans each navigation from start to commit or error", async () =>
    {
        const routes = defineRoutes({
            home: route({ path: "/", view: () => html`<h1>Home</h1>` }),
            note: route({
                path: "/notes/:id",
                load: ({ params }) => (params.id === "bad" ? Promise.reject(new Error("no such note")) : Promise.resolve({ id: params.id })),
                view: ({ data }) => html`<p>${data.id}</p>`
            })
        });
        const router = createRouter(routes, { window: null, observe: navigationObserver(tracer), onError: () => undefined });
        await router.navigate("/notes/1?tab=a");
        await router.navigate("/notes/bad");
        await router.navigate("/nowhere");
        router.dispose();
        const spans = exporter.getFinishedSpans();
        expect(spans.map((span) => span.name)).toEqual(["navigate", "navigate", "navigate"]);
        expect(spans[0]?.attributes).toMatchObject({ "url.path": "/notes/1", "url.query": "?tab=a", "zerolith.navigation.mode": "push", "zerolith.route": "note" });
        expect(spans[0]?.status.code).toBe(SpanStatusCode.OK);
        expect(spans[1]?.status.code).toBe(SpanStatusCode.ERROR);
        expect(spans[1]?.events[0]?.name).toBe("exception");
        expect(spans[2]?.attributes["zerolith.route"]).toBe("");
    });
});

describe("tracedTransport", () =>
{
    it("spans each request, records the status, and propagates traceparent", async () =>
    {
        const seen: Request[] = [];
        const transport = tracedTransport(async (request) =>
        {
            seen.push(request);
            return request.url.endsWith("/fail") ? new Response("no", { status: 500 }) : Response.json({ ok: true });
        }, tracer);
        const api = createClient<{ ping: { method: "get"; path: "/ping"; output: { ok: boolean } }; fail: { method: "post"; path: "/fail"; output: unknown } }>({ ping: { method: "get", path: "/ping" }, fail: { method: "post", path: "/fail" } }, { baseUrl: "https://api.test", transport });

        await tracer.startActiveSpan("page", async (parent) =>
        {
            await api.call("ping");
            parent.end();
        });
        await api.call("fail").catch(() => undefined);

        const spans = exporter.getFinishedSpans();
        expect(spans.map((span) => span.name)).toEqual(["GET /ping", "page", "POST /fail"]);
        const ping = spans[0];
        const page = spans[1];
        expect(ping?.attributes).toMatchObject({ "http.request.method": "GET", "url.full": "https://api.test/ping", "http.response.status_code": 200 });
        expect(ping?.parentSpanContext?.spanId).toBe(page?.spanContext().spanId);
        expect(seen[0]?.headers.get("traceparent")).toBe(`00-${ping?.spanContext().traceId}-${ping?.spanContext().spanId}-01`);
        expect(spans[2]?.status).toMatchObject({ code: SpanStatusCode.ERROR, message: "HTTP 500" });
        expect(seen[1]?.headers.get("traceparent")).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    });

    it("reports a failed request as an error and still rejects", async () =>
    {
        const transport = tracedTransport(() => Promise.reject(new TypeError("offline")), tracer);
        await expect(transport(new Request("https://api.test/x"))).rejects.toThrow("offline");
        expect(exporter.getFinishedSpans()[0]?.status).toMatchObject({ code: SpanStatusCode.ERROR, message: "offline" });
    });
});

describe("traceparent", () =>
{
    it("is undefined without an active span", () =>
    {
        expect(traceparent()).toBeUndefined();
    });
});
