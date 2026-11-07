// Runs the sign-up endpoint on Node's HTTP server, for the dev server's proxy.
import { type IncomingMessage, createServer } from "node:http";
import { answer } from "./sign-ups.ts";

const port = Number(process.env["PORT"] ?? "3000");

/** The incoming request as a Request, with its body read in full. */
async function toRequest(incoming: IncomingMessage): Promise<Request>
{
    const chunks: Buffer[] = [];
    for await (const chunk of incoming)
    {
        chunks.push(chunk as Buffer);
    }
    const method = incoming.method ?? "GET";
    const url = new URL(incoming.url ?? "/", `http://127.0.0.1:${port}`);
    return new Request(url, {
        method,
        headers: { "content-type": incoming.headers["content-type"] ?? "" },
        body: method === "GET" || method === "HEAD"
            ? null
            : Buffer.concat(chunks).toString("utf8")
    });
}

createServer(async (incoming, outgoing) =>
{
    let response: Response;
    try
    {
        response = await answer(await toRequest(incoming));
    }
    catch (error)
    {
        process.stderr.write(`${String(error)}\n`);
        response = new Response(null, { status: 500 });
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
}).listen(port, "127.0.0.1", () =>
{
    process.stdout.write(`Sign-ups at http://127.0.0.1:${port}/api/sign-ups\n`);
});
