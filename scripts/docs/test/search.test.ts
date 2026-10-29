import { execFile } from "node:child_process";
import { type Server } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaticServer, listen, repositoryRoot } from "../../static.ts";

/**
 * Builds the documentation site, serves it, and drives the search island in
 * headless Chromium: the server-rendered box is hydrated from the production
 * build through the page's import map, and a query finds pages by section.
 */

const run = promisify(execFile);
let server: Server;
let origin: string;
let browser: Browser;

beforeAll(async () =>
{
    await run(process.execPath, ["--conditions=development", "scripts/docs/build.ts"], { cwd: repositoryRoot });
    server = createStaticServer(join(repositoryRoot, "site"));
    origin = await listen(server);
    browser = await chromium.launch();
}, 120000);

afterAll(async () =>
{
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
});

describe("documentation search", () =>
{
    it("hydrates the island and finds sections for a query", { timeout: 60000 }, async () =>
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
        await page.goto(`${origin}/guide/forms/`);
        const input = page.locator("[data-island=\"search\"] input");
        await input.waitFor();
        expect(await page.locator("[data-island=\"search\"] li").count()).toBe(0);

        await input.fill("problem details");
        await page.waitForSelector("[data-island=\"search\"] li a");
        const hrefs = await page.$$eval("[data-island=\"search\"] li a", (links) => links.map((link) => link.getAttribute("href") ?? ""));
        expect(hrefs.length).toBeGreaterThan(0);
        expect(hrefs.some((href) => href.startsWith("/guide/forms/") || href.startsWith("/guide/client/"))).toBe(true);

        await input.fill("xqzv-nothing-matches");
        await page.waitForFunction(() => document.querySelectorAll("[data-island=\"search\"] li").length === 0);

        await input.fill("renderHead");
        await page.waitForSelector("[data-island=\"search\"] li a");
        await input.press("Escape");
        expect(await input.inputValue()).toBe("");
        expect(await page.locator("[data-island=\"search\"] li").count()).toBe(0);
        expect(errors).toEqual([]);
        await page.close();
    });
});
