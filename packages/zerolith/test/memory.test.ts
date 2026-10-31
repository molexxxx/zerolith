import { readFile } from "node:fs/promises";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Churns a keyed list and a condition in headless Chromium on the built
 * production runtime, collecting garbage between rounds, and checks that
 * the heap stays flat: rows and branches removed while their list or
 * condition lives on must leave nothing behind.
 */

const dist = fileURLToPath(new URL("../dist/production/", import.meta.url));

const page = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<script type="importmap">{"imports":{"zerolith":"/zerolith/index.js"}}</script>
<script type="module" src="/app.js"></script>
</head>
<body><main id="app"></main></body>
</html>`;

const app = `import { each, html, render, signal, when } from "zerolith";
const rows = signal([]);
const open = signal(false);
let next = 0;
render(html\`<ul>\${each(rows, (row) => row.id, () => html\`<li></li>\`)}</ul>\${when(open, () => html\`<p>open</p>\`)}\`, "#app");
globalThis.churn = (rounds) =>
{
    for (let round = 0; round < rounds; round++)
    {
        rows.set(Array.from({ length: 1000 }, () => ({ id: next++ })));
        rows.set([]);
        for (let toggle = 0; toggle < 200; toggle++)
        {
            open.set(!open.get());
        }
    }
};
`;

let server: Server;
let origin: string;
let browser: Browser;

beforeAll(async () =>
{
    server = createServer(async (request, response) =>
    {
        const url = request.url ?? "/";
        if (url === "/")
        {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            response.end(page);
            return;
        }
        if (url === "/app.js")
        {
            response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
            response.end(app);
            return;
        }
        if (url.startsWith("/zerolith/") && url.endsWith(".js") && !url.includes(".."))
        {
            try
            {
                const body = await readFile(dist + url.slice("/zerolith/".length));
                response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
                response.end(body);
                return;
            }
            catch
            {
                response.writeHead(404);
                response.end();
                return;
            }
        }
        response.writeHead(404);
        response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch();
}, 60000);

afterAll(async () =>
{
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
});

describe("memory", () =>
{
    it("keeps the heap flat while list rows and condition branches come and go", { timeout: 60000 }, async () =>
    {
        const tab = await browser.newPage();
        await tab.goto(`${origin}/`);
        await tab.waitForFunction(() => typeof (globalThis as { churn?: unknown }).churn === "function");
        const session = await tab.context().newCDPSession(tab);
        const heap = async (): Promise<number> =>
        {
            await session.send("HeapProfiler.collectGarbage");
            const usage = await session.send("Runtime.getHeapUsage");
            return usage.usedSize;
        };
        await tab.evaluate(() => (globalThis as unknown as { churn(rounds: number): void }).churn(5));
        const settled = await heap();
        await tab.evaluate(() => (globalThis as unknown as { churn(rounds: number): void }).churn(40));
        const after = await heap();
        expect(after - settled).toBeLessThan(512 * 1024);
        await tab.close();
    });
});
