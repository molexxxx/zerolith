import { createServer as createProbe } from "node:net";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { type ViteDevServer, createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exercise } from "./flow.ts";

/**
 * Starts the example's Vite dev server with its own configuration, the
 * zerolith plugin and the in-memory API included, and drives the app in
 * headless Chromium through the flow in flow.ts.
 */

const root = fileURLToPath(new URL("../", import.meta.url));

let server: ViteDevServer;
let browser: Browser;
let origin: string;

function freePort(): Promise<number>
{
    return new Promise((resolve, reject) =>
    {
        const probe = createProbe();
        probe.unref();
        probe.on("error", reject);
        probe.listen(0, "127.0.0.1", () =>
        {
            const address = probe.address();
            const port = typeof address === "object" && address !== null ? address.port : 0;
            probe.close(() => resolve(port));
        });
    });
}

beforeAll(async () =>
{
    const port = await freePort();
    server = await createServer({ root, configFile: `${root}vite.config.ts`, logLevel: "silent", server: { host: "127.0.0.1", port, strictPort: true } });
    await server.listen();
    origin = `http://127.0.0.1:${port}`;
    browser = await chromium.launch();
}, 90000);

afterAll(async () =>
{
    await browser?.close();
    await server?.close();
});

describe("tasks example", () =>
{
    it("lists, creates, deletes, validates, and switches languages without console errors", { timeout: 90000 }, async () =>
    {
        const context = await browser.newContext({ locale: "en-US" });
        expect(await exercise(context, origin)).toEqual([]);
        await context.close();
    });
});
