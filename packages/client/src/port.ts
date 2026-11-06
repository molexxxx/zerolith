/**
 * A transport over a message port, for the places `fetch` cannot reach the
 * server: an Electron renderer behind `contextBridge`, a worker, a test.
 * `portTransport` runs where the client runs; `servePort` runs where the
 * handler runs. Bodies travel as text, which covers JSON and encoded forms.
 */
import type { Transport } from "./index.js";

/** The port shapes supported: a DOM `MessagePort`, Node's, or Electron's `MessagePortMain`. */
export interface PortLike
{
    /** Sends a message to the other end; `portTransport` posts each `PortRequest` through it and `servePort` each `PortResponse`. */
    postMessage(message: unknown): void;
    /** Starts delivering messages; called, when present, right after the listener is attached, since a DOM `MessagePort` and Electron's `MessagePortMain` queue messages until it runs. */
    start?(): void;
    /** Receives messages the `EventTarget` way, as a DOM `MessagePort` does; used in preference to `on` when both exist. */
    addEventListener?(type: "message", listener: (event: { data: unknown }) => void): void;
    /** Receives messages the `EventEmitter` way, as Electron's `MessagePortMain` does; used when `addEventListener` is absent, and a port with neither throws a `TypeError`. */
    on?(type: "message", listener: (event: { data: unknown }) => void): void;
}

/** What crosses the port for a request. */
export interface PortRequest
{
    /** Tags the message as a request, so `servePort` ignores other traffic on the port. */
    kind: "zerolith:request";
    /** Pairs the request with its response; each `portTransport` numbers its requests from 1. */
    id: number;
    /** The request's absolute URL, from which `servePort` builds the `Request` its handler receives. */
    url: string;
    /** The request method as `Request.method` reports it, such as `POST`. */
    method: string;
    /** The request headers as `[name, value]` pairs with lowercase names, as iterating a `Headers` yields them. */
    headers: [string, string][];
    /** The body as UTF-8 text, or `null` for a `GET` or `HEAD` request or an empty body. */
    body: string | null;
}

/** What crosses the port for a response. */
export interface PortResponse
{
    /** Tags the message as a response, so `portTransport` ignores other traffic on the port. */
    kind: "zerolith:response";
    /** The `id` of the request this answers; an answer with no pending request, such as one whose call was aborted, is dropped. */
    id: number;
    /** The status code of the handler's response, or 500 when the handler threw. */
    status: number;
    /** The status text of the handler's response, empty when none was set. */
    statusText: string;
    /** The response headers as `[name, value]` pairs with lowercase names, as iterating a `Headers` yields them. */
    headers: [string, string][];
    /** The body as UTF-8 text, or `null` when it is empty, as for a 204. */
    body: string | null;
}

function listen(port: PortLike, handler: (data: unknown) => void): void
{
    if (typeof port.addEventListener === "function")
    {
        port.addEventListener("message", (event) => handler(event.data));
    }
    else if (typeof port.on === "function")
    {
        port.on("message", (event) => handler(event.data));
    }
    else
    {
        throw new TypeError("zerolith/client: the port has neither addEventListener nor on");
    }
    port.start?.();
}

/**
 * A `Transport` that sends each request over the port as a message and
 * resolves with the response that comes back under the same id. Aborting
 * the request's signal rejects the call; the message already sent is
 * answered and ignored.
 */
export function portTransport(port: PortLike): Transport
{
    const pending = new Map<number, { resolve: (response: Response) => void; reject: (reason: unknown) => void }>();
    let next = 1;
    listen(port, (data) =>
    {
        const message = data as Partial<PortResponse> | null;
        if (message === null || typeof message !== "object" || message.kind !== "zerolith:response" || typeof message.id !== "number")
        {
            return;
        }
        const waiting = pending.get(message.id);
        if (waiting === undefined)
        {
            return;
        }
        pending.delete(message.id);
        let response: Response;
        try
        {
            response = new Response(message.body ?? null, { status: message.status ?? 200, statusText: message.statusText ?? "", headers: message.headers ?? [] });
        }
        catch (error)
        {
            waiting.reject(error);
            return;
        }
        waiting.resolve(response);
    });
    return async (request) =>
    {
        const id = next++;
        const body = request.method === "GET" || request.method === "HEAD" ? null : await request.text();
        const message: PortRequest = { kind: "zerolith:request", id, url: request.url, method: request.method, headers: [...request.headers], body: body === "" ? null : body };
        return new Promise<Response>((resolve, reject) =>
        {
            if (request.signal.aborted)
            {
                reject(request.signal.reason ?? new DOMException("The request was aborted", "AbortError"));
                return;
            }
            const abort = (): void =>
            {
                if (pending.delete(id))
                {
                    reject(request.signal.reason ?? new DOMException("The request was aborted", "AbortError"));
                }
            };
            pending.set(id, {
                resolve: (response) =>
                {
                    request.signal.removeEventListener("abort", abort);
                    resolve(response);
                },
                reject: (reason) =>
                {
                    request.signal.removeEventListener("abort", abort);
                    reject(reason);
                }
            });
            request.signal.addEventListener("abort", abort, { once: true });
            port.postMessage(message);
        });
    };
}

/**
 * Answers the requests `portTransport` sends by building a `Request`,
 * calling `handler`, and posting the response back. A handler that throws
 * answers with a 500 problem so the client sees a `ProblemError`.
 */
export function servePort(port: PortLike, handler: (request: Request) => Response | Promise<Response>): void
{
    listen(port, (data) =>
    {
        const message = data as Partial<PortRequest> | null;
        if (message === null || typeof message !== "object" || message.kind !== "zerolith:request" || typeof message.id !== "number" || typeof message.url !== "string")
        {
            return;
        }
        const id = message.id;
        const answer = async (): Promise<void> =>
        {
            let response: Response;
            try
            {
                response = await handler(new Request(message.url ?? "", { method: message.method ?? "GET", headers: message.headers ?? [], body: message.body ?? null }));
            }
            catch (error)
            {
                if (typeof reportError === "function")
                {
                    reportError(error);
                }
                else
                {
                    console.error("zerolith/client: a servePort handler threw", error);
                }
                response = new Response(JSON.stringify({ title: "The handler failed", status: 500 }), { status: 500, headers: { "content-type": "application/problem+json" } });
            }
            const text = await response.text();
            const reply: PortResponse = { kind: "zerolith:response", id, status: response.status, statusText: response.statusText, headers: [...response.headers], body: text === "" ? null : text };
            port.postMessage(reply);
        };
        void answer();
    });
}
