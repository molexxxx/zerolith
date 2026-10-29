import { describe, expect, it, vi } from "vitest";
import { ProblemError, createClient } from "@zerolith/client";
import { type PortLike, portTransport, servePort } from "@zerolith/client/port";
import { type Api, routes } from "./fixtures/notes.api.ts";

function pair(): { client: MessagePort; server: MessagePort; close(): void }
{
    const channel = new MessageChannel();
    return { client: channel.port1, server: channel.port2, close: () => { channel.port1.close(); channel.port2.close(); } };
}

describe("portTransport and servePort", () =>
{
    it("carry requests and responses across a message channel", async () =>
    {
        const { client, server, close } = pair();
        const seen: string[] = [];
        servePort(server, async (request) =>
        {
            const url = new URL(request.url);
            seen.push(`${request.method} ${url.pathname}${url.search} ${request.headers.get("x-trace") ?? ""}`);
            if (request.method === "POST")
            {
                const body = await request.json() as { title: string };
                return Response.json({ id: "9", title: body.title, tags: [], visibility: "private" }, { status: 201 });
            }
            if (url.pathname === "/notes/missing")
            {
                return new Response(JSON.stringify({ title: "No such note" }), { status: 404, headers: { "content-type": "application/problem+json" } });
            }
            if (url.pathname === "/notes/gone")
            {
                return new Response(null, { status: 204 });
            }
            if (url.pathname === "/boom")
            {
                throw new Error("handler failed");
            }
            return Response.json({ items: [] });
        });
        const api = createClient<Api>(routes, { baseUrl: "https://app.local", transport: portTransport(client), headers: { "x-trace": "t1" } });

        await expect(api.call("listNotes", { query: { q: "x" } })).resolves.toEqual({ items: [] });
        await expect(api.call("createNote", { body: { title: "Ported" } })).resolves.toMatchObject({ id: "9", title: "Ported" });
        await expect(api.call("deleteNote", { params: { id: "gone" } })).resolves.toBeUndefined();
        const missing = await api.call("getNote", { params: { id: "missing" } }).catch((error: unknown) => error);
        expect(missing).toBeInstanceOf(ProblemError);
        expect((missing as ProblemError).problem).toEqual({ status: 404, title: "No such note" });
        const failed = await portTransport(client)(new Request("https://app.local/boom"));
        expect(failed.status).toBe(500);
        await expect(failed.json()).resolves.toEqual({ title: "handler failed", status: 500 });
        expect(seen).toEqual(["GET /notes?q=x t1", "POST /notes t1", "DELETE /notes/gone t1", "GET /notes/missing t1", "GET /boom "]);
        close();
    });

    it("rejects an aborted request and ignores its late answer", async () =>
    {
        const { client, server, close } = pair();
        let release: (() => void) | undefined;
        servePort(server, async (request) =>
        {
            if (request.url.endsWith("/slow"))
            {
                await new Promise<void>((resolve) =>
                {
                    release = resolve;
                });
                return Response.json({ late: true });
            }
            return Response.json({ next: true });
        });
        const transport = portTransport(client);
        const controller = new AbortController();
        const call = transport(new Request("https://app.local/slow", { signal: controller.signal }));
        controller.abort();
        await expect(call).rejects.toMatchObject({ name: "AbortError" });
        await vi.waitFor(() => expect(release).toBeDefined());
        release?.();
        await expect(transport(new Request("https://app.local/next")).then((response) => response.json())).resolves.toEqual({ next: true });
        close();
    });

    it("speaks to Node and Electron style ports through on and start", async () =>
    {
        const listeners: ((event: { data: unknown }) => void)[] = [];
        let started = 0;
        const port: PortLike = {
            postMessage(message)
            {
                for (const listener of listeners)
                {
                    listener({ data: message });
                }
            },
            on(_type, listener)
            {
                listeners.push(listener);
            },
            start()
            {
                started += 1;
            }
        };
        servePort(port, () => Response.json({ ok: true }));
        const transport = portTransport(port);
        expect(started).toBe(2);
        const response = await transport(new Request("https://app.local/x"));
        await expect(response.json()).resolves.toEqual({ ok: true });
        expect(() => portTransport({ postMessage() {} })).toThrow(/neither addEventListener nor on/);
    });
});
