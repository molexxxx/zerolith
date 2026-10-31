import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { type Server } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";
import { type Browser, type Page, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaticServer, listen, repositoryRoot } from "../../static.ts";
import { type Entry, group, rank } from "../search.js";

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
    it("opens the search from its button and its shortcuts, and shows, marks, and walks the results", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/guide/forms/");
        const dialog = page.locator("[data-island=\"search\"] dialog");
        const input = dialog.locator("input");
        const options = dialog.locator("[role=\"option\"]");
        const labels = (): Promise<string[]> => dialog.locator(".label").allTextContents();
        const isOpen = (): Promise<boolean> => dialog.evaluate((element) => (element as HTMLDialogElement).open);
        const entries = JSON.parse(await readFile(join(site, "search.json"), "utf8")) as Entry[];

        await page.click("[data-island=\"search\"] .trigger");
        await expect.poll(isOpen).toBe(true);
        await options.first().waitFor();
        expect(await labels()).toEqual(["Start here"]);

        await input.fill("problem details");
        await expect.poll(labels).not.toEqual(["Start here"]);
        const hrefs = await options.evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
        expect(hrefs.some((href) => href.startsWith("/guide/forms/") || href.startsWith("/guide/client/"))).toBe(true);
        expect(await options.locator("mark").count()).toBeGreaterThan(0);
        const first = await input.getAttribute("aria-activedescendant");
        await input.press("ArrowDown");
        expect(await input.getAttribute("aria-activedescendant")).not.toBe(first);

        await input.fill("");
        await input.pressSequentially("signal");
        await expect.poll(labels).toEqual(group(rank(entries, "signal")).map((section) => section.label));
        const ids = await options.evaluateAll((links) => links.map((link) => link.id));
        expect(new Set(ids).size).toBe(ids.length);

        await input.fill("xqzv-nothing-matches");
        await dialog.locator(".status").waitFor();
        expect(await options.count()).toBe(0);
        await input.press("Escape");
        await expect.poll(isOpen).toBe(false);

        await page.keyboard.press("/");
        await expect.poll(isOpen).toBe(true);
        await input.fill("renderHead");
        await options.first().waitFor();
        await input.press("Enter");
        await page.waitForURL((url) => url.pathname.startsWith("/reference/"));
        await page.keyboard.press("Control+k");
        await expect.poll(() => page.locator("[data-island=\"search\"] dialog").evaluate((element) => (element as HTMLDialogElement).open)).toBe(true);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("shows a Markdown file rendered with its source a tab away, and keeps the file's headings out of the page's outline", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/guide/structure/");
        const file = page.locator(".file").first();
        expect(await file.locator(".file-name").textContent()).toBe("AGENTS.md");
        expect(await file.locator(".file-preview h3").first().textContent()).toBe("my-app: guide for coding agents");
        expect(await file.locator(".file-source").isHidden()).toBe(true);
        await file.locator("[role=\"tab\"]", { hasText: "Source" }).click();
        expect(await file.locator(".file-preview").isHidden()).toBe(true);
        expect(await file.locator(".file-source pre").textContent()).toContain("# my-app: guide for coding agents\n");
        expect(await page.locator(".toc a").allTextContents()).not.toContain("Commands");
        expect(await page.locator("#commands").count()).toBe(0);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("gives a heading whose slug repeats another's an id of its own", { timeout: 60000 }, async () =>
    {
        const { page } = await open("/reference/zerolith/");
        const ids = await page.$$eval("[id]", (elements) => elements.map((element) => element.id));
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(expect.arrayContaining(["signal", "signal-2"]));
        await page.close();
    });

    it("runs the home page's figure and totals what the updates changed", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/");
        const readout = (): Promise<string[]> => page.$$eval(".readout dd", (values) => values.map((value) => value.textContent ?? ""));
        await page.waitForFunction(() => document.querySelector(".run .output p")?.textContent === "Count: 1, doubled: 2");
        expect(await readout()).toEqual(["0", "0", "1"]);
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".readout dd")?.textContent === "2");
        expect(await page.textContent(".run .output p")).toBe("Count: 2, doubled: 4");
        expect(await readout()).toEqual(["2", "0", "1"]);
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".readout dd")?.textContent === "4");
        expect(await page.textContent(".run .output p")).toBe("Count: 3, doubled: 6");
        expect(await readout()).toEqual(["4", "0", "1"]);
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

    it("submits forms in the preview", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/playground/#example=list");
        await page.click("[data-action=\"run\"]");
        const frame = page.frameLocator(".preview iframe");
        await frame.locator("li").first().waitFor({ timeout: 15000 });
        const before = await frame.locator("li").count();
        await frame.locator("input[name=\"name\"]").fill("Sunscreen");
        await frame.locator("button[type=\"submit\"], form button").first().click();
        await frame.locator("li", { hasText: "Sunscreen" }).waitFor({ timeout: 5000 });
        expect(await frame.locator("li").count()).toBe(before + 1);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("keeps the preview in the site's theme when the reader switches it, without running the code again", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/playground/#example=counter");
        await page.click("[data-action=\"run\"]");
        const frame = page.frameLocator(".preview iframe");
        await frame.locator("#app button").first().waitFor({ timeout: 15000 });
        const theme = (): Promise<string | null> => frame.locator("html").getAttribute("data-theme");
        const ground = (): Promise<string> => frame.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor);
        const initial = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
        expect(await theme()).toBe(initial);
        const before = await ground();
        await frame.locator("#app button").first().click();
        const counted = await frame.locator("#app p").first().textContent();
        await page.click(".theme-toggle");
        await expect.poll(theme).toBe(initial === "dark" ? "light" : "dark");
        expect(await ground()).not.toBe(before);
        expect(await frame.locator("#app p").first().textContent()).toBe(counted);
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

    it("moves between pages on the router without reloading, and starts each page's islands", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/guide/");
        const loads: string[] = [];
        page.on("request", (request) =>
        {
            if (request.resourceType() === "document")
            {
                loads.push(new URL(request.url()).pathname);
            }
        });
        await page.evaluate(() =>
        {
            (window as Window & { kept?: boolean }).kept = true;
        });
        const kept = (): Promise<boolean> => page.evaluate(() => (window as Window & { kept?: boolean }).kept === true);

        await page.click("#sidebar a[href=\"/guide/signals/\"]");
        await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Signals");
        expect(await page.title()).toBe("Signals | zerolith");
        expect(await page.locator("header .sections a[aria-current=\"true\"]").textContent()).toBe("Guide");
        expect(await kept()).toBe(true);

        await page.keyboard.press("Control+k");
        await page.locator("[data-island=\"search\"] [role=\"option\"]").first().waitFor();
        await page.keyboard.press("Escape");

        await page.goBack();
        await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Introduction");
        expect(await kept()).toBe(true);

        await page.click("header a[href=\"/playground/\"]");
        await page.frameLocator(".preview iframe").locator("#app button").first().waitFor({ timeout: 15000 });
        expect(await page.locator("[data-action=\"run\"]").getAttribute("data-stale")).toBeNull();
        await page.fill("textarea[name=\"code\"]", "import { html, render } from \"zerolith\";\nrender(html`<p>edited</p>`, \"#app\");\n");
        expect(await page.locator("[data-action=\"run\"]").getAttribute("data-stale")).toBe("");
        expect(await page.frameLocator(".preview iframe").locator("#app p").first().textContent()).not.toBe("edited");
        await page.click("[data-action=\"run\"]");
        await expect.poll(() => page.frameLocator(".preview iframe").locator("#app p").first().textContent()).toBe("edited");

        await page.click("header a.home");
        await page.waitForFunction(() => document.querySelector(".run .output p")?.textContent === "Count: 1, doubled: 2");
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".readout dd")?.textContent === "2");
        expect(await kept()).toBe(true);
        expect(loads).toEqual([]);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("pins every module the pages load with an integrity hash", async () =>
    {
        const home = await readFile(join(site, "index.html"), "utf8");
        const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(home)?.[1] ?? "{}") as { imports: Record<string, string>; integrity: Record<string, string> };
        expect(map.imports["zerolith"]).toBe("/zerolith/index.js");
        expect(map.imports["@zerolith/router"]).toBe("/router/index.js");
        for (const path of ["/zerolith/index.js", "/router/index.js", "/router/router.js", "/router/match.js", "/island.js", "/search.js", "/demo.js", "/playground.js", "/highlight.js"])
        {
            expect(map.integrity[path], path).toMatch(/^sha384-/);
        }
        expect(home).toMatch(/<script type="module" src="\/island.js" integrity="sha384-/);
        expect(home).toContain("<link rel=\"canonical\" href=\"https://molexxxx.github.io/zerolith/\">");
        const sitemap = await readFile(join(site, "sitemap.xml"), "utf8");
        expect(sitemap).toContain("<loc>https://molexxxx.github.io/zerolith/learn/state/</loc>");
    });
});
