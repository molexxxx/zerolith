import type { BrowserContext } from "playwright";
import { expect } from "vitest";

/**
 * Drives the app served at `origin` through the flow every test of the
 * example shares: the typed client lists tasks, the form creates one with
 * validation on both sides, search filters the list, the dialog traps focus,
 * and the locale switch re-renders every message. Returns the console errors
 * and page errors seen along the way.
 */
export async function exercise(context: BrowserContext, origin: string): Promise<string[]>
{
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
    await page.close();
    return errors;
}
