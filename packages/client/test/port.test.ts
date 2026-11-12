import { getEventListeners } from "node:events";
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
        await expect(failed.json()).resolves.toEqual({ title: "The handler failed", status: 500 });
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

    it("rejects a call whose answer cannot become a response, and releases its abort listener on every answer", async () =>
    {
        const { client, server, close } = pair();
        let answer = 0;
        server.addEventListener("message", (event: MessageEvent<{ id: number }>) =>
        {
            answer += 1;
            server.postMessage({ kind: "zerolith:response", id: event.data.id, status: answer === 2 ? 99 : 200, statusText: "", headers: [["content-type", "application/json"]], body: "{\"items\":[]}" }, []);
        });
        server.start();
        const port = portTransport(client);
        const signals: AbortSignal[] = [];
        const api = createClient<Api>(routes, {
            baseUrl: "https://api.test",
            transport: (request) =>
            {
                signals.push(request.signal);
                return port(request);
            }
        });
        const caller = new AbortController();
        await expect(api.call("listNotes", {}, { signal: caller.signal })).resolves.toEqual({ items: [] });
        await expect(api.call("listNotes", {}, { signal: caller.signal })).rejects.toThrow(RangeError);
        await expect(api.call("listNotes", {}, { signal: caller.signal })).resolves.toEqual({ items: [] });
        expect(signals.map((signal) => getEventListeners(signal, "abort").length)).toEqual([0, 0, 0]);
        close();
    });

    it("answers with its 500 problem when the handler's response cannot be read or is not a response", async () =>
    {
        const reported = vi.fn();
        vi.stubGlobal("reportError", reported);
        const { client, server, close } = pair();
        try
        {
            servePort(server, (request) =>
            {
                if (new URL(request.url).pathname !== "/broken")
                {
                    return undefined as unknown as Response;
                }
                return new Response(new ReadableStream({
                    start(controller)
                    {
                        controller.error(new Error("the connection dropped"));
                    }
                }));
            });
            const port = portTransport(client);
            const broken = await port(new Request("https://app.local/broken"));
            const missing = await port(new Request("https://app.local/missing"));
            expect([broken.status, missing.status]).toEqual([500, 500]);
            await expect(broken.json()).resolves.toEqual({ title: "The handler failed", status: 500 });
            expect(reported).toHaveBeenCalledTimes(2);
        }
        finally
        {
            close();
            vi.unstubAllGlobals();
        }
    });

    it("keeps the calls of two transports on one port apart", async () =>
    {
        const { client, server, close } = pair();
        try
        {
            const held: { id: number; path: string }[] = [];
            server.addEventListener("message", (event: MessageEvent<{ id: number; url: string }>) =>
            {
                held.push({ id: event.data.id, path: new URL(event.data.url).pathname });
                if (held.length === 2)
                {
                    for (const { id, path } of held.toReversed())
                    {
                        server.postMessage({ kind: "zerolith:response", id, status: 200, statusText: "", headers: [["content-type", "text/plain"]], body: path }, []);
                    }
                }
            });
            server.start();
            const first = portTransport(client);
            const second = portTransport(client);
            const answers = await Promise.all([first(new Request("https://app.local/first")), second(new Request("https://app.local/second"))]);
            expect(await Promise.all(answers.map((answer) => answer.text()))).toEqual(["/first", "/second"]);
        }
        finally
        {
            close();
        }
    });

    it("keeps the calls of transports from two copies of the module on one port apart", async () =>
    {
        vi.resetModules();
        const one = await import("@zerolith/client/port");
        vi.resetModules();
        const other = await import("@zerolith/client/port");
        const { client, server, close } = pair();
        try
        {
            const held: { id: number; path: string }[] = [];
            server.addEventListener("message", (event: MessageEvent<{ id: number; url: string }>) =>
            {
                held.push({ id: event.data.id, path: new URL(event.data.url).pathname });
                if (held.length === 2)
                {
                    for (const { id, path } of held.toReversed())
                    {
                        server.postMessage({ kind: "zerolith:response", id, status: 200, statusText: "", headers: [["content-type", "text/plain"]], body: path }, []);
                    }
                }
            });
            server.start();
            const first = one.portTransport(client);
            const second = other.portTransport(client);
            const answers = await Promise.all([first(new Request("https://app.local/first")), second(new Request("https://app.local/second"))]);
            expect(await Promise.all(answers.map((answer) => answer.text()))).toEqual(["/first", "/second"]);
        }
        finally
        {
            close();
        }
    });

    it("rejects a call whose message the port refuses, and lets go of its abort listener", async () =>
    {
        const refused = new DOMException("The object could not be cloned.", "DataCloneError");
        const port: PortLike = {
            postMessage: () =>
            {
                throw refused;
            },
            addEventListener: () => undefined
        };
        const request = new Request("https://app.local/notes", { signal: new AbortController().signal });
        await expect(portTransport(port)(request)).rejects.toBe(refused);
        expect(getEventListeners(request.signal, "abort")).toHaveLength(0);
    });

    it("cancels the handler's body unread for a HEAD request, whatever the casing of its method", async () =>
    {
        const { client, server, close } = pair();
        try
        {
            const canceled: string[] = [];
            servePort(server, (request) => new Response(new ReadableStream({
                start(controller)
                {
                    controller.enqueue(new TextEncoder().encode("unread"));
                },
                cancel()
                {
                    canceled.push(request.method);
                }
            })));
            const answers: unknown[] = [];
            client.addEventListener("message", (event: MessageEvent) => answers.push(event.data));
            client.start();
            client.postMessage({ kind: "zerolith:request", id: 1, url: "https://app.local/notes", method: "head", headers: [], body: null }, []);
            await vi.waitFor(() => expect(answers).toHaveLength(1));
            expect((answers[0] as { body: unknown }).body).toBeNull();
            await vi.waitFor(() => expect(canceled).toEqual(["HEAD"]));
        }
        finally
        {
            close();
        }
    });

    it("sends no body in the answer to a HEAD request, a failure's included, and leaves the handler's body unread", async () =>
    {
        const reported = vi.fn();
        vi.stubGlobal("reportError", reported);
        const { client, server, close } = pair();
        try
        {
            servePort(server, (request) =>
            {
                const path = new URL(request.url).pathname;
                if (path === "/broken")
                {
                    throw new Error("the handler failed");
                }
                if (path === "/duck")
                {
                    return { status: 200, statusText: "", headers: new Headers(), body: {}, text: async () => "unread" } as unknown as Response;
                }
                if (path === "/stream")
                {
                    return new Response(new ReadableStream({
                        start(controller)
                        {
                            controller.error(new Error("the connection dropped"));
                        }
                    }));
                }
                return Response.json({ title: "a note" });
            });
            const port = portTransport(client);
            const answers = await Promise.all(["/notes", "/broken", "/stream", "/duck"].map((path) => port(new Request(`https://app.local${path}`, { method: "HEAD" }))));
            expect(await Promise.all(answers.map(async (answer) => [answer.status, await answer.text()]))).toEqual([[200, ""], [500, ""], [200, ""], [200, ""]]);
            expect(reported).toHaveBeenCalledTimes(1);
        }
        finally
        {
            close();
            vi.unstubAllGlobals();
        }
    });
});
