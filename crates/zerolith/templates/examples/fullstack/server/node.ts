// Runs a function from Request to Response on Node's HTTP server. Each
// incoming request becomes a Request whose signal aborts when the client goes
// away, and each Response streams back as it is produced, so server-sent
// events reach the page as they happen. The server listens on 127.0.0.1, so
// only a reverse proxy on the same machine reaches it, and the HTTPS that
// proxy terminates reaches the app through X-Forwarded-Proto. A request the
// Fetch API cannot represent, such as one with a malformed Host header or the
// TRACE method, gets 400 instead of taking the process down, and an error the
// app throws is written to stderr and answered with 500.
import { type IncomingMessage, type Server, createServer } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

/** The incoming request as a Request whose signal is `signal`; throws when the Fetch API cannot represent it. */
function toRequest(incoming: IncomingMessage, signal: AbortSignal, host: string): Request
{
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers))
    {
        for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value])
        {
            headers.append(name, item);
        }
    }
    const method = incoming.method ?? "GET";
    const init: RequestInit & { duplex?: "half" } = { method, headers, signal };
    if (method !== "GET" && method !== "HEAD")
    {
        init.body = Readable.toWeb(incoming) as unknown as ReadableStream<Uint8Array>;
        init.duplex = "half";
    }
    const protocol = incoming.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    return new Request(new URL(incoming.url ?? "/", `${protocol}://${incoming.headers.host ?? host}`), init);
}

/** Writes an error the app threw to stderr and answers the request with 500. */
function failed(error: unknown): Response
{
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    return new Response(null, { status: 500 });
}

/** Listens on `port` and resolves with the server once it is accepting connections. */
export function serve(app: (request: Request) => Promise<Response>, port: number, host = "127.0.0.1"): Promise<Server>
{
    const server = createServer((incoming, outgoing) =>
    {
        const abort = new AbortController();
        outgoing.on("close", () => abort.abort());
        let request: Request;
        try
        {
            request = toRequest(incoming, abort.signal, host);
        }
        catch
        {
            outgoing.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
            outgoing.end("Bad request\n");
            return;
        }
        void app(request).catch(failed).then((response) =>
        {
            const head: Record<string, string | string[]> = {};
            response.headers.forEach((value, name) =>
            {
                if (name !== "set-cookie")
                {
                    head[name] = value;
                }
            });
            const cookies = response.headers.getSetCookie();
            if (cookies.length > 0)
            {
                head["set-cookie"] = cookies;
            }
            outgoing.writeHead(response.status, head);
            if (response.body === null)
            {
                outgoing.end();
                return;
            }
            Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>).pipe(outgoing);
        });
    });
    return new Promise((resolve) =>
    {
        server.listen(port, host, () => resolve(server));
    });
}
