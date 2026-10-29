import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createProbe } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { type ViteDevServer, createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zerolith } from "@zerolith/vite";

/**
 * Runs a real Vite dev server over a copy of the fixture application and
 * drives it in headless Chromium: edits to a component module, to the
 * module that composes it, and to the entry module itself all apply
 * without a page reload, and the named signal keeps its value through
 * each one.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = fileURLToPath(new URL("./fixture/", import.meta.url));

let folder: string;
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

async function edit(name: string, change: (text: string) => string): Promise<void>
{
    const file = join(folder, name);
    await writeFile(file, change(await readFile(file, "utf8")));
}

beforeAll(async () =>
{
    folder = await mkdtemp(join(tmpdir(), "zerolith-vite-"));
    await cp(fixture, folder, { recursive: true });
    const port = await freePort();
    server = await createServer({
        root: folder,
        configFile: false,
        envFile: false,
        logLevel: "silent",
        clearScreen: false,
        plugins: [zerolith()],
        resolve: {
            alias: {
                "@zerolith/vite/runtime": join(repoRoot, "packages/vite/src/runtime.ts"),
                zerolith: join(repoRoot, "packages/zerolith/src/index.ts")
            }
        },
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { host: "127.0.0.1", port, strictPort: true, fs: { allow: [repoRoot, folder] } }
    });
    await server.listen();
    origin = `http://127.0.0.1:${port}`;
    browser = await chromium.launch();
}, 60000);

afterAll(async () =>
{
    await browser?.close();
    await server?.close();
    if (folder !== undefined)
    {
        await rm(folder, { recursive: true, force: true });
    }
});

describe("hot module replacement", () =>
{
    it("swaps components in place and keeps named signal state without reloading the page", { timeout: 90000 }, async () =>
    {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("console", (message) =>
        {
            if (message.type() === "error")
            {
                errors.push(message.text());
            }
        });
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${origin}/`);
        await page.waitForSelector("[data-testid=\"count\"]");
        let loads = 0;
        page.on("load", () =>
        {
            loads += 1;
        });

        expect(await page.textContent("[data-testid=\"count\"]")).toBe("Count: 0");
        await page.click("[data-testid=\"increment\"]");
        await page.click("[data-testid=\"increment\"]");
        expect(await page.textContent("[data-testid=\"count\"]")).toBe("Count: 2");

        await edit("counter.ts", (text) => text.replace("\"Count\"", "\"Clicks\""));
        await page.waitForFunction(() => document.querySelector("[data-testid=\"count\"]")?.textContent === "Clicks: 2", undefined, { timeout: 30000 });
        expect(await page.locator("[data-testid=\"count\"]").count()).toBe(1);

        await edit("app.ts", (text) => text.replace("HMR fixture", "HMR fixture, edited"));
        await page.waitForFunction(() => document.querySelector("h1")?.textContent === "HMR fixture, edited", undefined, { timeout: 30000 });
        expect(await page.textContent("[data-testid=\"count\"]")).toBe("Clicks: 2");

        await edit("main.ts", (text) => `${text}\ndocument.title = "edited";\n`);
        await page.waitForFunction(() => document.title === "edited", undefined, { timeout: 30000 });
        expect(await page.locator("[data-testid=\"count\"]").count()).toBe(1);
        expect(await page.textContent("[data-testid=\"count\"]")).toBe("Clicks: 2");

        await page.click("[data-testid=\"increment\"]");
        expect(await page.textContent("[data-testid=\"count\"]")).toBe("Clicks: 3");

        expect(loads).toBe(0);
        expect(errors).toEqual([]);
        await page.close();
    });
});
