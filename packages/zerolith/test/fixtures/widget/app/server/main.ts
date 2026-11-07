// Serves the example handler on Node at http://127.0.0.1:3000 and prints
// each piece of feedback it receives.
import { type IncomingMessage, createServer } from "node:http";
import { text } from "node:stream/consumers";
import { feedbackHandler } from "./feedback.ts";

const port = Number(process.env["PORT"] ?? "3000");
const origin = `http://127.0.0.1:${port}`;
const handle = feedbackHandler((feedback) =>
{
    process.stdout.write(`feedback ${JSON.stringify(feedback)}\n`);
});

/**
 * The request Node received, as a Request, or undefined when the Fetch API
 * cannot represent it, as with the TRACE method.
 */
async function requestOf(
    incoming: IncomingMessage
): Promise<Request | undefined>
{
    const method = incoming.method ?? "GET";
    try
    {
        const body = method === "GET" || method === "HEAD"
            ? null
            : await text(incoming);
        const url = new URL(incoming.url ?? "/", origin);
        return new Request(url, { method, body });
    }
    catch
    {
        return undefined;
    }
}

createServer(async (incoming, outgoing) =>
{
    const request = await requestOf(incoming);
    const response = request === undefined
        ? new Response(null, { status: 400 })
        : await handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
}).listen(port, "127.0.0.1", () =>
{
    process.stdout.write(`Feedback handler at ${origin}/feedback\n`);
});
