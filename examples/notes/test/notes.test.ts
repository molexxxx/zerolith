import { type Server } from "node:http";
import { type Browser, type Page, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaticServer, listen } from "../../../scripts/static.js";

/**
 * Drives the notes example in headless Chromium over the static server:
 * the built packages load through the import map, the seed data arrives
 * through a resource, and routing, the keyed list, the form, and
 * persistence are exercised as a user would.
 */

let server: Server;
let origin: string;
let browser: Browser;

beforeAll(async () =>
{
    server = createStaticServer();
    origin = await listen(server);
    browser = await chromium.launch();
});

afterAll(async () =>
{
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
});

async function open(): Promise<{ page: Page; errors: string[] }>
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
    await page.goto(`${origin}/examples/notes/`);
    await page.waitForSelector("[data-testid=\"notes\"] li");
    return { page, errors };
}

describe("notes example", () =>
{
    it("seeds, searches, navigates, creates, edits, deletes, and persists without console errors", { timeout: 30000 }, async () =>
    {
        const { page, errors } = await open();
        expect(await page.locator("[data-testid=\"notes\"] li").count()).toBe(3);
        expect(await page.title()).toBe("Notes");

        await page.fill("[data-testid=\"search\"]", "rout");
        expect(await page.locator("[data-testid=\"notes\"] li").count()).toBe(1);
        await page.fill("[data-testid=\"search\"]", "zzz");
        await page.waitForSelector("[data-testid=\"empty\"]");
        await page.fill("[data-testid=\"search\"]", "");

        await page.click("[data-testid=\"notes\"] li a:has-text(\"Routing\")");
        await page.waitForSelector("[data-testid=\"note\"]");
        expect(new URL(page.url()).pathname).toBe("/examples/notes/notes/routing");
        expect(await page.title()).toBe("Note routing");
        expect(await page.textContent("[data-testid=\"note\"] h2")).toBe("Routing");

        await page.click("[data-testid=\"note\"] a:has-text(\"Edit\")");
        await page.waitForSelector("[data-testid=\"form\"]");
        expect(await page.evaluate(() => document.activeElement?.getAttribute("name"))).toBe("title");
        await page.fill("[data-testid=\"form\"] input[name=\"title\"]", "Routing, edited");
        await page.click("[data-testid=\"form\"] button");
        await page.waitForSelector("[data-testid=\"note\"]");
        expect(await page.textContent("[data-testid=\"note\"] h2")).toBe("Routing, edited");

        await page.click("[data-testid=\"new\"]");
        await page.waitForSelector("[data-testid=\"form\"]");
        await page.fill("[data-testid=\"form\"] input[name=\"title\"]", "x");
        await page.click("[data-testid=\"form\"] button");
        expect(new URL(page.url()).pathname).toBe("/examples/notes/new");
        await page.fill("[data-testid=\"form\"] input[name=\"title\"]", "Fourth note");
        await page.fill("[data-testid=\"form\"] textarea", "Created in the test.");
        await page.click("[data-testid=\"form\"] button");
        await page.waitForSelector("[data-testid=\"note\"]");
        expect(await page.textContent("[data-testid=\"note\"] h2")).toBe("Fourth note");

        await page.click("main header h1 a");
        await page.waitForSelector("[data-testid=\"notes\"]");
        expect(await page.locator("[data-testid=\"notes\"] li").count()).toBe(4);
        expect(await page.textContent("[data-testid=\"notes\"] li:first-child a")).toBe("Fourth note");

        await page.click("[data-testid=\"notes\"] li:first-child a");
        await page.waitForSelector("[data-testid=\"note\"]");
        await page.goBack();
        await page.waitForSelector("[data-testid=\"notes\"]");
        expect(new URL(page.url()).pathname).toBe("/examples/notes/");
        await page.goForward();
        await page.waitForSelector("[data-testid=\"note\"]");
        expect(await page.textContent("[data-testid=\"note\"] h2")).toBe("Fourth note");
        await page.goBack();
        await page.waitForSelector("[data-testid=\"notes\"]");

        await page.click("[data-testid=\"notes\"] li:first-child button");
        expect(await page.locator("[data-testid=\"notes\"] li").count()).toBe(3);

        await page.reload();
        await page.waitForSelector("[data-testid=\"notes\"] li");
        expect(await page.locator("[data-testid=\"notes\"] li").count()).toBe(3);
        expect(await page.textContent("[data-testid=\"notes\"] li a:has-text(\"edited\")")).toBe("Routing, edited");

        await page.goto(`${origin}/examples/notes/notes/nope`);
        await page.waitForSelector("[data-testid=\"missing\"]");
        await page.goto(`${origin}/examples/notes/elsewhere`);
        await page.waitForSelector("[data-testid=\"not-found\"]");

        expect(errors).toEqual([]);
        await page.close();
    });
});
