import { createServer as createProbe } from "node:net";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { type ViteDevServer, createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Starts the example's Vite dev server with its own configuration, the
 * zerolith plugin and the in-memory API included, and drives the app in
 * headless Chromium: the typed client lists tasks, the form creates one
 * with validation on both sides, the dialog traps focus, and the locale
 * switch re-renders every message.
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
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("console", (message) =>
        {
            if (message.type() === "error")
            {
                errors.push(message.text());
            }
        });
        page.on("pageerror", (error) => errors.push(error.message));
        await page.request.post(`${origin}/api/tasks/reset`);
        await page.goto(`${origin}/`);
        await page.waitForSelector("[data-testid=\"open\"] li");
        expect(await page.locator("[data-testid=\"open\"] li").count()).toBe(2);
        expect(await page.locator("[data-testid=\"done\"] li").count()).toBe(1);
        expect(await page.textContent("[data-testid=\"open-count\"]")).toBe("2 open tasks");
        expect(await page.title()).toBe("Tasks");

        await page.click("[data-testid=\"new\"]");
        await page.waitForSelector("[data-testid=\"form\"]");
        await page.fill("[data-testid=\"form\"] input[name=\"title\"]", "x");
        await page.click("[data-testid=\"form\"] button");
        await page.waitForFunction(() => document.querySelector("[data-testid=\"title-error\"]")?.textContent !== "");
        expect(await page.getAttribute("[data-testid=\"form\"] input[name=\"title\"]", "aria-invalid")).toBe("true");

        await page.fill("[data-testid=\"form\"] input[name=\"title\"]", "Write the tasks example");
        await page.click("[data-testid=\"form\"] button");
        await page.waitForFunction(() => document.querySelectorAll("[data-testid=\"open\"] li").length === 3);
        expect(new URL(page.url()).pathname).toBe("/");
        expect(await page.textContent("[data-testid=\"open-count\"]")).toBe("3 open tasks");

        await page.fill("[data-testid=\"search\"]", "example");
        expect(await page.locator("[data-testid=\"open\"] li").count()).toBe(1);
        await page.fill("[data-testid=\"search\"]", "");

        await page.click("[data-testid=\"open\"] li a:has-text(\"Write the tasks example\")");
        await page.waitForSelector("[data-testid=\"task\"] h2");
        await page.click("[data-testid=\"delete\"]");
        await page.waitForSelector("[data-testid=\"dialog\"]");
        expect(await page.evaluate(() => document.activeElement?.textContent)).toBe("Cancel");
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => document.querySelector("[data-testid=\"dialog\"]") === null);
        expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("delete");
        await page.click("[data-testid=\"delete\"]");
        await page.click("[data-testid=\"confirm\"]");
        await page.waitForFunction(() => document.querySelectorAll("[data-testid=\"open\"] li").length === 2);

        await page.selectOption("[data-testid=\"language\"]", "de");
        await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Aufgaben");
        expect(await page.textContent("[data-testid=\"open-count\"]")).toBe("2 offene Aufgaben");
        expect(await page.getAttribute("html", "lang")).toBe("de");

        await page.selectOption("[data-testid=\"language\"]", "en");
        await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Tasks");
        expect(errors).toEqual([]);
        await context.close();
    });
});
