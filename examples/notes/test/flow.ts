import type { Browser } from "playwright";
import { expect } from "vitest";

/**
 * Drives the notes example served at `origin` as a user would: the seed
 * data arrives through a resource, then search, routing, the form with
 * validation and focus, creating, editing, deleting, history, persistence
 * across a reload, and the two not-found views. Returns the console errors
 * and page errors seen along the way.
 */
export async function exercise(browser: Browser, origin: string): Promise<string[]>
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
    await page.waitForSelector("[data-testid=\"notes\"] li");
    expect(await page.locator("[data-testid=\"notes\"] li").count()).toBe(3);
    expect(await page.title()).toBe("Notes");

    await page.fill("[data-testid=\"search\"]", "rout");
    expect(await page.locator("[data-testid=\"notes\"] li").count()).toBe(1);
    await page.fill("[data-testid=\"search\"]", "zzz");
    await page.waitForSelector("[data-testid=\"empty\"]");
    await page.fill("[data-testid=\"search\"]", "");

    await page.click("[data-testid=\"notes\"] li a:has-text(\"Routing\")");
    await page.waitForSelector("[data-testid=\"note\"]");
    expect(new URL(page.url()).pathname).toBe("/notes/routing");
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
    expect(new URL(page.url()).pathname).toBe("/new");
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
    expect(new URL(page.url()).pathname).toBe("/");
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

    await page.goto(`${origin}/notes/nope`);
    await page.waitForSelector("[data-testid=\"missing\"]");
    await page.goto(`${origin}/elsewhere`);
    await page.waitForSelector("[data-testid=\"not-found\"]");
    await page.close();
    return errors;
}
