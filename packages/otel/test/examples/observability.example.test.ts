// Executed examples for the observability guide.
import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { html } from "zerolith";
import { createClient } from "@zerolith/client";
import { navigationObserver, tracedTransport } from "@zerolith/otel";
import { createRouter, defineRoutes, route } from "@zerolith/router";
import { type Api, routes as apiRoutes } from "../../../client/test/fixtures/notes.api.ts";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
const manager = new AsyncLocalStorageContextManager();

beforeAll(() =>
{
    manager.enable();
    context.setGlobalContextManager(manager);
    trace.setGlobalTracerProvider(provider);
});

afterEach(() =>
{
    vi.unstubAllGlobals();
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
        const sent: Request[] = [];
        vi.stubGlobal("fetch", (request: Request) =>
        {
            sent.push(request);
            return Promise.resolve(Response.json({ items: [] }));
        });
        // #region spans
        const tracer = trace.getTracer("notes");

        const router = createRouter(routes, { observe: navigationObserver(tracer) });
        const api = createClient<Api>(apiRoutes, {
            baseUrl: "https://notes.example",
            transport: tracedTransport(fetch, tracer)
        });

        await router.navigate("/");             // a "navigate" span
        await api.call("listNotes");            // a "GET /notes" span and a traceparent header
        // #endregion spans
        const spans = exporter.getFinishedSpans();
        expect(spans.map((span) => span.name)).toEqual(["navigate", "GET /notes"]);
        expect(sent[0]?.headers.get("traceparent")).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
        router.dispose();
    });
});
