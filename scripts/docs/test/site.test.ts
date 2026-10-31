import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { type Server } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";
import { type Browser, type Page, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaticServer, listen, repositoryRoot } from "../../static.ts";

/**
 * Builds the documentation site once, serves it, and drives its islands in
 * headless Chromium: the search, the home page's running figure, and the
 * playground, each hydrated or started from the production build through
 * the page's import map with integrity hashes.
 */

const run = promisify(execFile);
const site = join(repositoryRoot, "site");
let server: Server;
let origin: string;
let browser: Browser;

beforeAll(async () =>
{
    await run(process.execPath, ["--conditions=development", "scripts/docs/build.ts"], { cwd: repositoryRoot });
    server = createStaticServer(site);
    origin = await listen(server);
    browser = await chromium.launch();
}, 120000);

afterAll(async () =>
{
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
});

/** A page that records console errors and failed loads, which every test expects to stay empty. */
async function open(path: string): Promise<{ page: Page; errors: string[] }>
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
    await page.goto(`${origin}${path}`);
    return { page, errors };
}

describe("documentation site", () =>
{
    it("hydrates the search island and finds sections for a query", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/guide/forms/");
        const input = page.locator("[data-island=\"search\"] input");
        await input.waitFor();
        expect(await page.locator("[data-island=\"search\"] li").count()).toBe(0);

        await input.fill("problem details");
        await page.waitForSelector("[data-island=\"search\"] li a");
        const hrefs = await page.$$eval("[data-island=\"search\"] li a", (links) => links.map((link) => link.getAttribute("href") ?? ""));
        expect(hrefs.some((href) => href.startsWith("/guide/forms/") || href.startsWith("/guide/client/"))).toBe(true);

        await input.fill("xqzv-nothing-matches");
        await page.waitForFunction(() => document.querySelectorAll("[data-island=\"search\"] li").length === 0);

        await input.fill("renderHead");
        await page.waitForSelector("[data-island=\"search\"] li a");
        await input.press("Escape");
        expect(await input.inputValue()).toBe("");
        expect(errors).toEqual([]);
        await page.close();
    });

    it("runs the home page's figure and measures what each update changed", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/");
        const readout = (): Promise<string[]> => page.$$eval(".readout dd", (values) => values.map((value) => value.textContent ?? ""));
        await page.waitForFunction(() => document.querySelector(".run .output p")?.textContent === "Count: 1, doubled: 2");
        expect(await readout()).toEqual(["0", "0", "1"]);
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".readout dd")?.textContent === "2");
        expect(await page.textContent(".run .output p")).toBe("Count: 2, doubled: 4");
        expect(await readout()).toEqual(["2", "0", "1"]);
        expect(await page.locator(".figure code [data-signal]").count()).toBe(2);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("runs every playground example without an error", { timeout: 120000 }, async () =>
    {
        const { page, errors } = await open("/playground/");
        const ids = await page.$$eval("select[name=\"example\"] option", (options) => options.map((option) => (option as HTMLOptionElement).value));
        expect(ids.length).toBeGreaterThan(5);
        const failures: string[] = [];
        for (const id of ids)
        {
            await page.selectOption("select[name=\"example\"]", id);
            await page.click("[data-action=\"run\"]");
            const frame = page.frameLocator(".preview iframe");
            await frame.locator("#app > *").first().waitFor({ timeout: 15000 });
            const reported = await page.$$eval(".console .error", (lines) => lines.map((line) => line.textContent ?? ""));
            failures.push(...reported.map((line) => `${id}: ${line}`));
        }
        expect(failures).toEqual([]);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("opens a shared playground link with its code", { timeout: 60000 }, async () =>
    {
        const { page } = await open("/playground/#example=conditions");
        await page.waitForFunction(() => (document.querySelector("textarea[name=\"code\"]") as HTMLTextAreaElement | null)?.value.includes("Sign in as Ada") === true);
        await page.close();
    });

    it("links each tutorial step to the next, and the last into the guide", { timeout: 60000 }, async () =>
    {
        const first = await readFile(join(site, "learn", "index.html"), "utf8");
        expect(first).toContain("href=\"/learn/page/\" rel=\"next\"");
        const last = await readFile(join(site, "learn", "ship", "index.html"), "utf8");
        expect(last).toContain("href=\"/guide/\" rel=\"next\"");
    });

    it("pins every module the pages load with an integrity hash", async () =>
    {
        const home = await readFile(join(site, "index.html"), "utf8");
        const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(home)?.[1] ?? "{}") as { imports: Record<string, string>; integrity: Record<string, string> };
        expect(map.imports["zerolith"]).toBe("/zerolith/index.js");
        for (const path of ["/zerolith/index.js", "/island.js", "/search.js", "/demo.js", "/playground.js", "/highlight.js"])
        {
            expect(map.integrity[path], path).toMatch(/^sha384-/);
        }
        expect(home).toMatch(/<script type="module" src="\/island.js" integrity="sha384-/);
        expect(home).toContain("<link rel=\"canonical\" href=\"https://molexxxx.github.io/zerolith/\">");
        const sitemap = await readFile(join(site, "sitemap.xml"), "utf8");
        expect(sitemap).toContain("<loc>https://molexxxx.github.io/zerolith/learn/state/</loc>");
    });
});
