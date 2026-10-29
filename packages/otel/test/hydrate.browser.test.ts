import { SpanStatusCode, trace } from "@opentelemetry/api";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type Root, html } from "zerolith";
import { renderToString } from "zerolith/ssr";
import { tracedHydrate } from "@zerolith/otel";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
let host: HTMLElement | undefined;
let root: Root | undefined;
const view = (): unknown => html`<p>${"same"}</p>`;

beforeAll(() =>
{
    trace.setGlobalTracerProvider(provider);
});

afterAll(async () =>
{
    await provider.shutdown();
    trace.disable();
});

afterEach(() =>
{
    root?.dispose();
    host?.remove();
    exporter.reset();
});

describe("tracedHydrate", () =>
{
    it("wraps hydration in a span and records the mismatches", () =>
    {
        host = document.createElement("div");
        document.body.append(host);
        host.innerHTML = renderToString(view());
        root = tracedHydrate(view(), host, trace.getTracer("test"));
        const [span] = exporter.getFinishedSpans();
        expect(span?.name).toBe("hydrate");
        expect(span?.attributes["zerolith.hydration.mismatches"]).toBe(0);
        expect(span?.status.code).toBe(SpanStatusCode.OK);
    });
});
