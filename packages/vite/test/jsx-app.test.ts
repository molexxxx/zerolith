import { cp, mkdtemp, rm } from "node:fs/promises";
import { createServer as createProbe } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { type ViteDevServer, createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zerolith } from "@zerolith/vite";

/**
 * Serves the JSX fixture through a real Vite dev server: the lowering runs
 * ahead of Vite's own transform, the served module is html calls with no
 * JSX left, and the page renders and reacts in Chromium.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = fileURLToPath(new URL("./fixture-jsx/", import.meta.url));

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

beforeAll(async () =>
{
    folder = await mkdtemp(join(tmpdir(), "zerolith-jsx-"));
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

describe("JSX through the dev server", () =>
{
    it("serves lowered modules and renders them", { timeout: 60000 }, async () =>
    {
        const served = await server.transformRequest("/counter.tsx");
        expect(served?.code).toContain("__zl_html`<section data-testid=\"counter\">");
        expect(served?.code).not.toContain("<section data-testid=\"counter\">\n");
        expect(served?.code).toContain("@click=${() => count.set(count.get() + 1)}");

        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${origin}/`);
        await page.waitForSelector("[data-testid=\"count\"]");
        expect(await page.textContent("[data-testid=\"count\"]")).toBe("Count: 2");
        expect(await page.evaluate(() => document.querySelector("h1")?.title)).toBe("JSX fixture");
        expect(await page.textContent("[data-testid=\"child\"]")).toBe("a child");
        await page.click("[data-testid=\"increment\"]");
        expect(await page.textContent("[data-testid=\"count\"]")).toBe("Count: 3");
        expect(errors).toEqual([]);
        await page.close();
    });
});
