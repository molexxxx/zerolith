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
    postMessage(message: unknown): void;
    start?(): void;
    addEventListener?(type: "message", listener: (event: { data: unknown }) => void): void;
    on?(type: "message", listener: (event: { data: unknown }) => void): void;
}

/** What crosses the port for a request. */
export interface PortRequest
{
    kind: "zerolith:request";
    id: number;
    url: string;
    method: string;
    headers: [string, string][];
    body: string | null;
}

/** What crosses the port for a response. */
export interface PortResponse
{
    kind: "zerolith:response";
    id: number;
    status: number;
    statusText: string;
    headers: [string, string][];
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
        waiting.resolve(new Response(message.body ?? null, { status: message.status ?? 200, statusText: message.statusText ?? "", headers: message.headers ?? [] }));
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
            pending.set(id, { resolve, reject });
            request.signal.addEventListener("abort", () =>
            {
                if (pending.delete(id))
                {
                    reject(request.signal.reason ?? new DOMException("The request was aborted", "AbortError"));
                }
            });
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
                const title = error instanceof Error ? error.message : String(error);
                response = new Response(JSON.stringify({ title, status: 500 }), { status: 500, headers: { "content-type": "application/problem+json" } });
            }
            const text = await response.text();
            const reply: PortResponse = { kind: "zerolith:response", id, status: response.status, statusText: response.statusText, headers: [...response.headers], body: text === "" ? null : text };
            port.postMessage(reply);
        };
        void answer();
    });
}
