import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { deflateRawSync } from "node:zlib";
import { type Browser, type Page, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaticServer, listen, repositoryRoot, resolvePath } from "../../static.ts";
import { type Entry, group, rank } from "../search.js";

/**
 * Builds the documentation site once, serves it, and drives its islands in
 * headless Chromium: the search, the home page's running figure, the wheel
 * scroller, and the playground, each hydrated or started from the production build through
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

/** A page's markup without the comments that mark its bindings for hydration. */
function unmarked(html: string): string
{
    return html.replace(/<!--\/?zl:p-->/g, "");
}

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

/** The page's scroll position on each of the next `count` frames. */
function framePositions(page: Page, count: number): Promise<number[]>
{
    return page.evaluate((frames) => new Promise<number[]>((resolve) =>
    {
        const positions: number[] = [];
        const frame = (): void =>
        {
            positions.push(Math.round(scrollY));
            if (positions.length < frames)
            {
                requestAnimationFrame(frame);
            }
            else
            {
                resolve(positions);
            }
        };
        requestAnimationFrame(frame);
    }), count);
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
        const tree = page.locator(".tree");
        expect(await tree.locator("li").count()).toBe(27);
        expect(await tree.locator("li").first().textContent()).toBe("my-app/");
        expect(await tree.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
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

    it("runs launch control on the home page, totals what each change did to the DOM, and draws it only when the reader acts", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/");
        const readout = (): Promise<string[]> => page.$$eval(".readout dd", (values) => values.map((value) => value.textContent ?? ""));
        const display = (): Promise<string> => page.$eval(".run .output .display", (element) => element.textContent ?? "");
        const drawing = (): Promise<number> => page.evaluate(() => document.querySelector(".flow")?.getAnimations({ subtree: true }).length ?? 0);
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent === "Ready");
        expect(await readout()).toEqual(["0", "0", "0", "1"]);
        expect(await drawing()).toBe(0);
        await page.locator(".run .output input[type=\"range\"]").fill("90");
        await page.waitForFunction(() => document.querySelector(".run .output label:nth-of-type(3)")?.textContent?.includes("90%") === true);
        expect(await drawing()).toBeGreaterThan(0);
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent?.startsWith("T-") === true);
        expect(await page.textContent(".run .output button")).toBe("Abort");
        await page.waitForFunction(() => document.querySelector("[data-run=\"tick\"]")?.hasAttribute("data-running") === true);
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent === "Aborted");
        expect(await page.textContent(".run .output button")).toBe("Reset");
        expect(await page.locator("[data-run=\"tick\"][data-running]").count()).toBe(0);
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent === "Ready");
        const [texts, , created, calls] = await readout();
        expect(Number(texts)).toBeGreaterThan(3);
        expect(created).toBe("0");
        expect(calls).toBe("1");
        expect(await display()).toBe("Ready");
        expect(await page.locator(".figure code [data-signal]").count()).toBe(6);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("flies launch control to orbit at the default throttle", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/");
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent === "Ready");
        await page.click(".run .output button");
        await page.waitForFunction(() => ["In orbit", "Out of fuel", "Aborted"].includes(document.querySelector(".run .output .display")?.textContent ?? ""), null, { timeout: 30000 });
        expect(await page.textContent(".run .output .display")).toBe("In orbit");
        expect(await page.$$eval(".run .output progress", (bars) => bars.map((bar) => (bar as HTMLProgressElement).value > 0))).toEqual([true, true]);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("switches the home page's tour between its patterns by click and arrow key", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/");
        const shown = (): Promise<string[]> => page.$$eval(".tour [role=\"tabpanel\"]", (panels) => (panels as HTMLElement[]).filter((panel) => !panel.hidden).map((panel) => panel.id));
        expect(await shown()).toEqual(["tour-signals-panel"]);
        await page.click("#tour-forms");
        expect(await shown()).toEqual(["tour-forms-panel"]);
        expect(await page.getAttribute("#tour-forms", "aria-selected")).toBe("true");
        expect(await page.getAttribute("#tour-signals", "aria-selected")).toBe("false");
        expect(await page.textContent("#tour-forms-panel code")).toContain("createForm");
        await page.focus("#tour-forms");
        await page.keyboard.press("ArrowRight");
        expect(await shown()).toEqual(["tour-server-rendering-panel"]);
        expect(await page.evaluate(() => document.activeElement?.id)).toBe("tour-server-rendering");
        await page.keyboard.press("ArrowRight");
        expect(await shown()).toEqual(["tour-signals-panel"]);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("runs every playground example without an error or a warning, in a frame without modal dialogs", { timeout: 120000 }, async () =>
    {
        const { page, errors } = await open("/playground/");
        expect(await page.getAttribute(".preview iframe", "sandbox")).toBe("allow-scripts allow-forms");
        const entries = await page.evaluate(() => history.length);
        const ids = await page.$$eval("select[name=\"example\"] option", (options) => options.map((option) => (option as HTMLOptionElement).value));
        expect(ids.length).toBeGreaterThan(5);
        const failures: string[] = [];
        for (const id of ids)
        {
            await page.click(".picker-button");
            await page.click(`.picker-list [role="option"][data-value="${id}"]`);
            await page.click("[data-action=\"run\"]");
            const frame = page.frameLocator(".preview iframe");
            await frame.locator("#app > *").first().waitFor({ timeout: 15000 });
            await page.waitForTimeout(1000);
            const reported = await page.$$eval(".console .error, .console .warn", (lines) => lines.map((line) => line.textContent ?? ""));
            failures.push(...reported.map((line) => `${id}: ${line}`));
        }
        expect(failures).toEqual([]);
        expect(errors).toEqual([]);
        expect(await page.evaluate(() => history.length)).toBe(entries);
        await page.close();
    });

    it("marks the section the reader is in on the table of contents as the page scrolls", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/guide/signals/");
        const current = (): Promise<string[]> => page.$$eval(".toc a[aria-current]", (links) => links.map((link) => link.getAttribute("href") ?? ""));
        expect(await current()).toEqual(["#reading-and-writing"]);
        await page.evaluate(() => document.getElementById("effects")?.scrollIntoView());
        await expect.poll(current).toEqual(["#effects"]);
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        const last = await page.$$eval(".toc a", (links) => links.at(-1)?.getAttribute("href") ?? "");
        await expect.poll(current).toEqual([last]);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("picks a playground example from its own listbox by pointer and by keyboard", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/playground/");
        const trigger = page.locator(".picker-button");
        expect(await page.isVisible("select[name=\"example\"]")).toBe(false);
        expect(await trigger.getAttribute("aria-expanded")).toBe("false");
        await trigger.focus();
        await page.keyboard.press("ArrowDown");
        expect(await trigger.getAttribute("aria-expanded")).toBe("true");
        expect(await page.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("listbox");
        await page.keyboard.press("ArrowDown");
        const second = await page.$eval(".picker-list [role=\"option\"]:nth-child(2)", (option) => option.getAttribute("data-value"));
        expect(await page.getAttribute(".picker-list", "aria-activedescendant")).toBe(`example-${second}`);
        await page.keyboard.press("Enter");
        expect(await page.inputValue("select[name=\"example\"]")).toBe(second);
        expect(await trigger.getAttribute("aria-expanded")).toBe("false");
        expect(await page.evaluate(() => document.activeElement?.classList.contains("picker-button"))).toBe(true);
        expect(await page.getAttribute(`#example-${second}`, "aria-selected")).toBe("true");
        expect(await page.textContent("#example-current")).toBe(await page.textContent(`#example-${second} .name`));
        expect(page.url()).toContain(`#example=${second}`);
        await trigger.click();
        await page.keyboard.press("Escape");
        expect(await trigger.getAttribute("aria-expanded")).toBe("false");
        await trigger.click();
        await page.mouse.click(5, 5);
        expect(await trigger.getAttribute("aria-expanded")).toBe("false");
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

    it("opens the example a link names, and the first one for a name that is not an example", { timeout: 60000 }, async () =>
    {
        const { page } = await open("/playground/#example=conditions");
        await page.waitForFunction(() => (document.querySelector("textarea[name=\"code\"]") as HTMLTextAreaElement | null)?.value.includes("Sign in as Ada") === true);
        await page.close();
        const inherited = await open("/playground/#example=constructor");
        const first = await inherited.page.$eval("select[name=\"example\"] option", (option) => (option as HTMLOptionElement).value);
        expect(await inherited.page.inputValue("select[name=\"example\"]")).toBe(first);
        await inherited.page.close();
    });

    it("copies a link that opens the same code, and says where to find the link when the browser will not copy it", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/playground/");
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin });
        const program = "import { html, render } from \"zerolith\";\nrender(html`<p>shared</p>`, \"#app\");\n";
        await page.fill("textarea[name=\"code\"]", program);
        await page.click("[data-action=\"share\"]");
        await page.locator("[data-action=\"share\"][data-copied]").waitFor();
        const link = await page.evaluate(() => navigator.clipboard.readText());
        expect(link.startsWith(`${origin}/playground/#code=`)).toBe(true);
        const shared = await open(link.slice(origin.length));
        await expect.poll(() => shared.page.frameLocator(".preview iframe").locator("#app p").first().textContent()).toBe("shared");
        expect(await shared.page.inputValue("textarea[name=\"code\"]")).toBe(program);
        expect(shared.errors).toEqual([]);
        await shared.page.close();

        await page.evaluate(() =>
        {
            Object.defineProperty(navigator, "clipboard", { value: { write: () => Promise.reject(new Error("refused")), writeText: () => Promise.reject(new Error("refused")) } });
        });
        await page.click("[data-action=\"share\"]");
        await expect.poll(() => page.textContent(".playground .hint")).toContain("copy the link from the address bar");
        expect(errors).toEqual([]);
        await page.close();
    });

    it("opens a damaged or oversized shared link with an example, and says why in the console", { timeout: 60000 }, async () =>
    {
        const oversized = deflateRawSync(Buffer.from(`// ${"a".repeat(400000)}\n`)).toString("base64url");
        for (const packed of ["not-a-deflate-stream", oversized])
        {
            const { page, errors } = await open(`/playground/#code=${packed}`);
            await page.locator(".console .error").first().waitFor({ timeout: 15000 });
            expect(await page.textContent(".console .error")).toBe("The code in this link could not be read, so the editor shows an example instead.");
            expect(await page.inputValue("textarea[name=\"code\"]")).toContain("zerolith");
            expect(errors).toEqual([]);
            await page.close();
        }
    });

    it("shows an error, a map, a set, and undefined in the preview's console by their contents", { timeout: 60000 }, async () =>
    {
        const { page } = await open("/playground/");
        await page.fill("textarea[name=\"code\"]", "console.error(new TypeError(\"boom\"));\nconsole.log(new Map([[\"a\", 1]]), new Set([2]), undefined, [new Error(\"inner\")]);\n");
        await page.click("[data-action=\"run\"]");
        await expect.poll(() => page.$$eval(".console p", (lines) => lines.map((line) => line.textContent ?? ""))).toEqual(["TypeError: boom", "Map [[\"a\",1]] Set [2] undefined [\"Error: inner\"]"]);
        await page.close();
    });

    it("loads the search index again when search reopens after a failed load", { timeout: 60000 }, async () =>
    {
        const { page } = await open("/guide/forms/");
        await page.route("**/search.json", (route) => route.abort(), { times: 1 });
        const dialog = page.locator("[data-island=\"search\"] dialog");
        await page.click("[data-island=\"search\"] .trigger");
        await dialog.locator(".status", { hasText: "did not load" }).waitFor();
        await page.keyboard.press("Escape");
        await expect.poll(() => dialog.evaluate((element) => (element as HTMLDialogElement).open)).toBe(false);
        await page.click("[data-island=\"search\"] .trigger");
        await dialog.locator("[role=\"option\"]").first().waitFor();
        expect(await dialog.locator(".status", { hasText: "did not load" }).count()).toBe(0);
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
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent === "Ready");
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent?.startsWith("T-") === true);
        await page.waitForFunction(() => Number(document.querySelector(".readout dd")?.textContent) > 0);
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent === "Aborted");
        expect(await kept()).toBe(true);
        expect(loads).toEqual([]);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("eases wheel scrolling on a fine pointer, lands each navigation where the router puts it, and takes heading links through history", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/guide/routing/");
        await page.setViewportSize({ width: 1600, height: 900 });
        await page.waitForFunction(() => document.documentElement.classList.contains("lenis"));
        await page.mouse.move(800, 450);
        await page.mouse.wheel(0, 400);
        expect(new Set(await framePositions(page, 20)).size).toBeGreaterThan(5);
        await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(400);

        await page.mouse.wheel(0, 2400);
        await page.click("#sidebar a[href=\"/guide/forms/\"]");
        await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Forms");
        expect(Math.max(...await framePositions(page, 30))).toBe(0);

        await page.mouse.move(800, 450);
        await page.mouse.wheel(0, 700);
        await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(700);
        await page.click("#sidebar a[href=\"/guide/routing/\"]");
        await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Routing");
        await page.goBack();
        await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Forms");
        expect(new Set(await framePositions(page, 30))).toEqual(new Set([700]));

        await page.goForward();
        await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Routing" && scrollY === 0);
        const entries = await page.evaluate(() => history.length);
        await page.click(".toc a[href=\"#the-route-table\"]");
        expect(new Set(await framePositions(page, 20)).size).toBeGreaterThan(5);
        await expect.poll(() => page.evaluate(() => Math.round(document.getElementById("the-route-table")?.getBoundingClientRect().top ?? 0))).toBe(96);
        expect(await page.evaluate(() => ({ hash: location.hash, entries: history.length, focused: document.activeElement?.id }))).toEqual({ hash: "#the-route-table", entries: entries + 1, focused: "the-route-table" });
        await page.goBack();
        await expect.poll(() => page.evaluate(() => `${location.hash}${Math.round(scrollY)}`)).toBe("0");

        await page.evaluate(() =>
        {
            const link = document.createElement("a");
            link.id = "malformed";
            link.href = "#%E0%A4%A";
            link.textContent = "a link whose fragment holds a malformed escape";
            document.querySelector("main")?.prepend(link);
        });
        await page.click("#malformed");
        await expect.poll(() => page.evaluate(() => location.hash)).toBe("#%E0%A4%A");
        expect(errors).toEqual([]);
        await page.close();
    });

    it("keeps native scrolling and never loads the wheel scroller under reduced motion or on touch", { timeout: 60000 }, async () =>
    {
        for (const options of [{ reducedMotion: "reduce" as const }, { isMobile: true, hasTouch: true }])
        {
            const context = await browser.newContext(options);
            const page = await context.newPage();
            const requested: string[] = [];
            page.on("request", (request) => requested.push(new URL(request.url()).pathname));
            await page.goto(`${origin}/guide/routing/`, { waitUntil: "networkidle" });
            expect(requested).toContain("/island.js");
            expect(requested).not.toContain("/smooth.js");
            expect(await page.evaluate(() => document.documentElement.classList.contains("lenis"))).toBe(false);
            await context.close();
        }
    });

    it("answers only loopback requests, refuses dot-folders and malformed escapes, and keeps serving", async () =>
    {
        expect((await fetch(`${origin}/%E0%A4%A`)).status).toBe(400);
        expect((await fetch(`${origin}/`)).status).toBe(200);
        expect(resolvePath("/.git/config", site)).toBeUndefined();
        expect(resolvePath("/guide/../.env", site)).toBeUndefined();
        const { request } = await import("node:http");
        const status = await new Promise<number | undefined>((resolve, reject) =>
        {
            const port = Number(new URL(origin).port);
            request({ host: "127.0.0.1", port, path: "/", headers: { host: "rebound.example" } }, (answer) =>
            {
                answer.resume();
                resolve(answer.statusCode);
            }).on("error", reject).end();
        });
        expect(status).toBe(403);
    });

    it("pins every module the pages load with an integrity hash", async () =>
    {
        const home = await readFile(join(site, "index.html"), "utf8");
        const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(home)?.[1] ?? "{}") as { imports: Record<string, string>; integrity: Record<string, string> };
        expect(map.imports["zerolith"]).toBe("/zerolith/index.js");
        expect(map.imports["@zerolith/router"]).toBe("/router/index.js");
        for (const path of ["/zerolith/index.js", "/router/index.js", "/router/router.js", "/router/match.js", "/island.js", "/search.js", "/demo.js", "/playground.js", "/highlight.js", "/smooth.js"])
        {
            expect(map.integrity[path], path).toMatch(/^sha384-/);
        }
        expect(home).toMatch(/<script type="module" src="\/island.js" integrity="sha384-/);
        expect(await readFile(join(site, "smooth.js"), "utf8")).toMatch(/^\/\*!\nThe MIT License\n\nCopyright \(c\) \d{4} darkroom\.engineering\n/);
        expect(await readFile(join(site, "styles.css"), "utf8")).toContain(".lenis.lenis-smooth iframe");
        expect(home).toContain("<link rel=\"canonical\" href=\"https://zerolith.dev/\">");
        const sitemap = await readFile(join(site, "sitemap.xml"), "utf8");
        expect(sitemap).toContain("<loc>https://zerolith.dev/learn/state/</loc>");
    });

    it("builds a pre-release's site under /next/ with a switch to the stable docs that the rebase leaves alone, and the stable site with a switch to /next/", async () =>
    {
        const scratch = await mkdtemp(join(tmpdir(), "zerolith-site-next-"));
        try
        {
            const version = JSON.parse(await readFile(join(repositoryRoot, "packages", "zerolith", "package.json"), "utf8")) as { version: string };
            const shown = JSON.stringify({ stable: { version: "0.0.1", base: "/" }, next: { version: version.version, base: "/next/" } });
            await run(process.execPath, ["--conditions=development", "scripts/docs/build.ts"], { cwd: repositoryRoot, env: { ...process.env, ZEROLITH_DOCS_OUT: join(scratch, "next"), ZEROLITH_DOCS_BASE: "/next/", ZEROLITH_DOCS_URL: "https://zerolith.dev/next/", ZEROLITH_DOCS_VERSIONS: shown } });
            const guide = unmarked(await readFile(join(scratch, "next", "guide", "index.html"), "utf8"));
            expect(guide).toContain("href=\"/guide/\" data-version-switch");
            expect(guide).toContain("0.0 docs</a>");
            expect(guide).toContain("href=\"/next/styles.css\"");
            expect(guide).not.toContain("href=\"/styles.css\"");
            const stableShown = JSON.stringify({ stable: { version: version.version, base: "/" }, next: { version: "9.0.0-alpha.1", base: "/next/" } });
            await run(process.execPath, ["--conditions=development", "scripts/docs/build.ts"], { cwd: repositoryRoot, env: { ...process.env, ZEROLITH_DOCS_OUT: join(scratch, "stable"), ZEROLITH_DOCS_VERSIONS: stableShown } });
            const stable = unmarked(await readFile(join(scratch, "stable", "guide", "index.html"), "utf8"));
            expect(stable).toContain("href=\"/next/guide/\" data-version-switch");
            expect(stable).toContain("9.0 alpha docs</a>");
            expect(await readFile(join(site, "guide", "index.html"), "utf8")).not.toContain("data-version-switch");
        }
        finally
        {
            await rm(scratch, { recursive: true, force: true });
        }
    }, 120000);

    it("serves the production builds of the core and the router, and the source map each pinned module names, with its sources inside", async () =>
    {
        const home = await readFile(join(site, "index.html"), "utf8");
        const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(home)?.[1] ?? "{}") as { integrity: Record<string, string> };
        let named = 0;
        for (const path of Object.keys(map.integrity).filter((key) => key.endsWith(".js")))
        {
            const file = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(await readFile(join(site, path), "utf8"))?.[1];
            if (file === undefined)
            {
                continue;
            }
            named++;
            const sourceMap = JSON.parse(await readFile(join(site, dirname(path), file), "utf8")) as { sources: string[]; sourcesContent?: string[] };
            expect(sourceMap.sourcesContent?.length, path).toBe(sourceMap.sources.length);
        }
        expect(named).toBeGreaterThan(0);
        for (const path of ["/zerolith/render.js", "/router/router.js"])
        {
            expect(await readFile(join(site, path), "utf8"), path).not.toContain("/**");
        }
    });
});
