// Executed examples for the observability guide.
import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { html } from "zerolith";
import { createClient } from "@zerolith/client";
import { navigationObserver, tracedTransport } from "@zerolith/otel";
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

describe("observability guide", () =>
{
    it("traces navigations and requests", async () =>
    {
        const routes = defineRoutes({ home: route({ path: "/", view: () => html`<h1>Home</h1>` }) });
        const seen: Request[] = [];
        // #region spans
        const tracer = trace.getTracer("notes");

        const router = createRouter(routes, { window: null, observe: navigationObserver(tracer) });
        const api = createClient<{ listNotes: { method: "get"; path: "/notes"; output: unknown } }>({ listNotes: { method: "get", path: "/notes" } }, {
            baseUrl: "https://notes.example",
            transport: tracedTransport(async (request) =>
            {
                seen.push(request);                                             // the request carries traceparent
                return Response.json([]);
            }, tracer)
        });

        await router.navigate("/");
        await api.call("listNotes");
        // #endregion spans
        const spans = exporter.getFinishedSpans();
        expect(spans.map((span) => span.name)).toEqual(["navigate", "GET /notes"]);
        expect(seen[0]?.headers.get("traceparent")).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
        router.dispose();
    });
});
