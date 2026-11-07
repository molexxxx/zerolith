import { createHash } from "node:crypto";
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

/** Whether the playground's example list lies inside the page, which does not scroll sideways; it runs in the page. */
function listInside(): boolean
{
    const view = document.documentElement.clientWidth;
    const list = document.querySelector(".picker-list")?.getBoundingClientRect();
    return list !== undefined && list.width > 0 && list.left >= 0 && list.right <= view && document.documentElement.scrollWidth <= view && scrollX === 0;
}

/** Whether every tab of the home page's tour shows whole inside the page, which does not scroll sideways, and inside its row, which does not scroll either; it runs in the page. */
function tabsInside(): boolean
{
    const view = document.documentElement.clientWidth;
    const list = document.querySelector(".tour [role=\"tablist\"]");
    if (list === null)
    {
        return false;
    }
    const row = list.getBoundingClientRect();
    const tabs = Array.from(list.querySelectorAll("[role=\"tab\"]"), (tab) => tab.getBoundingClientRect());
    return tabs.length > 0 && tabs.every((box) => box.width > 0 && box.left >= Math.max(0, row.left) && box.right <= Math.min(view, row.right)) && list.scrollWidth <= list.clientWidth && document.documentElement.scrollWidth <= view && scrollX === 0;
}

/** A page that records console errors and failed loads, which every test expects to stay empty; `device` sets its viewport and input. */
async function open(path: string, device?: Parameters<Browser["newPage"]>[0]): Promise<{ page: Page; errors: string[] }>
{
    const page = await browser.newPage(device);
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

/** The short form of a file's hash that the site puts in the address of a file it versions. */
function addressVersion(content: Buffer): string
{
    return createHash("sha384").update(content).digest("base64").slice(0, 12).replace(/[+/=]/g, "");
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
        const drawing = (): Promise<number> => page.evaluate(() => document.querySelector(".flow .landscape")?.getAnimations({ subtree: true }).length ?? 0);
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent === "Ready");
        expect(await readout()).toEqual(["0", "0", "0", "1"]);
        expect(await drawing()).toBe(0);
        await page.locator(".run .output input[type=\"range\"]").fill("90");
        await page.waitForFunction(() => document.querySelector(".run .output label:nth-of-type(3)")?.textContent?.includes("90%") === true);
        expect(await drawing()).toBeGreaterThan(0);
        expect(await page.evaluate(() => document.querySelector(".flow .portrait")?.getAnimations({ subtree: true }).length)).toBe(0);
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent?.startsWith("T-") === true);
        expect(await page.textContent(".run .output button")).toBe("Abort");
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent === "Aborted");
        expect(await page.textContent(".run .output button")).toBe("Launch");
        await page.click(".run .output button");
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent?.startsWith("T-") === true);
        const [texts, , created, calls] = await readout();
        expect(Number(texts)).toBeGreaterThan(3);
        expect(created).toBe("0");
        expect(calls).toBe("1");
        expect(await page.textContent(".run .output button")).toBe("Abort");
        expect(await page.locator(".figure code [data-signal]").count()).toBe(6);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("sends a square along each edge of launch control's flow only where its code ran", { timeout: 90000 }, async () =>
    {
        const { page, errors } = await open("/");
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() =>
        {
            const pulses: string[] = [];
            Object.assign(window, { pulses });
            const animate = Element.prototype.animate;
            Element.prototype.animate = function lit(this: Element, ...args: Parameters<Element["animate"]>)
            {
                const edge = this.getAttribute("data-for");
                if (edge !== null && this.closest(".landscape") !== null)
                {
                    pulses.push(edge);
                }
                return animate.apply(this, args);
            };
        });
        const lit = () => page.evaluate(() => (window as unknown as { pulses: string[] }).pulses.splice(0));
        await page.$eval(".run .output input[type=\"range\"]", (input) =>
        {
            (input as HTMLInputElement).value = "90";
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await expect.poll(lit).toEqual(["steer>throttle", "throttle>dom-throttle"]);

        await page.click(".run .output button");
        await page.waitForFunction(() => (window as unknown as { pulses: string[] }).pulses.includes("live>clock"));
        const launched = await lit();
        expect(launched).toEqual(expect.arrayContaining(["press>stage", "stage>live", "live>clock", "live>action", "action>dom-action", "stage>readout", "readout>dom-readout"]));
        expect(launched).not.toContain("throttle>clock");
        expect(await page.getAttribute(".flow .landscape [data-edge=\"throttle>clock\"]", "data-reading")).toBeNull();

        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent?.endsWith("km") === true, null, { timeout: 15000 });
        await page.waitForTimeout(400);
        const flying = await lit();
        expect(flying).toEqual(expect.arrayContaining(["clock>stage", "clock>countdown", "clock>altitude", "clock>fuel", "altitude>readout"]));
        expect(flying).not.toContain("live>clock");
        expect(flying).not.toContain("throttle>clock");
        expect(await page.getAttribute(".flow .landscape [data-edge=\"throttle>clock\"]", "data-reading")).toBe("");

        await page.waitForFunction(() => ["In orbit", "Out of fuel"].includes(document.querySelector(".run .output .display")?.textContent ?? ""), null, { timeout: 30000 });
        await page.waitForTimeout(400);
        expect(await lit()).toEqual(expect.arrayContaining(["clock>stage", "stage>live", "live>clock", "live>action"]));
        expect(await page.textContent(".run .output button")).toBe("Launch");
        expect(await page.getAttribute(".flow .landscape [data-edge=\"throttle>clock\"]", "data-reading")).toBeNull();

        await page.click(".run .output button");
        await expect.poll(lit).toEqual(expect.arrayContaining(["press>stage", "live>clock", "clock>countdown", "clock>altitude", "clock>fuel"]));
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

    it("draws launch control's flow down a phone, inside its panel, every label inside its box, and runs each change along it", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/");
        expect(await page.isVisible(".flow .landscape")).toBe(true);
        expect(await page.isVisible(".flow .portrait")).toBe(false);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent === "Ready");
        expect(await page.isVisible(".flow .landscape")).toBe(false);
        expect(await page.isVisible(".flow .portrait")).toBe(true);
        expect(await page.$eval(".flow", (flow) => flow.scrollWidth <= flow.clientWidth)).toBe(true);
        expect(await page.$$eval(".flow .portrait .head", (heads) => heads.map((head) => head.textContent))).toEqual(["event", "signal", "computed", "effect", "signal", "computed", "DOM"]);
        const layout = await page.$eval(".flow .portrait", (svg) =>
        {
            const view = (svg as SVGSVGElement).viewBox.baseVal;
            const boxes = Array.from(svg.querySelectorAll(".node")).map((node) => ({ rect: (node.querySelector("rect") as SVGRectElement).getBBox(), text: (node.querySelector("text") as SVGTextElement).getComputedTextLength() }));
            const inside = boxes.every(({ rect }) => rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= view.width && rect.y + rect.height <= view.height);
            const fitted = boxes.every(({ rect, text }) => text <= rect.width - 8);
            const apart = boxes.every(({ rect: a }, index) => boxes.slice(index + 1).every(({ rect: b }) => a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y));
            return { nodes: boxes.length, edges: svg.querySelectorAll("[data-edge]").length, inside, fitted, apart };
        });
        expect(layout).toEqual({ nodes: 16, edges: 18, inside: true, fitted: true, apart: true });
        const ids = await page.evaluate(() => [".flow .portrait", ".flow .landscape"].map((drawing) => Array.from(document.querySelectorAll(`${drawing} [data-node], ${drawing} [data-edge]`), (element) => element.getAttribute("data-node") ?? element.getAttribute("data-edge")).toSorted().join(" ")));
        expect(ids[0]).toBe(ids[1]);
        const crossed = await page.$$eval(".flow svg", (drawings) => drawings.flatMap((svg) =>
        {
            const boxes = Array.from(svg.querySelectorAll("[data-node]"), (node) => ({ id: node.getAttribute("data-node"), box: (node.querySelector("rect") as SVGRectElement).getBBox() }));
            return Array.from(svg.querySelectorAll("[data-edge]") as NodeListOf<SVGPathElement>).flatMap((path) =>
            {
                const length = path.getTotalLength();
                const points = Array.from({ length: Math.ceil(length / 2) + 1 }, (_, step) => path.getPointAtLength(Math.min(length, step * 2)));
                return boxes.filter(({ box }) => points.some((point) => point.x > box.x + 1 && point.x < box.x + box.width - 1 && point.y > box.y + 1 && point.y < box.y + box.height - 1)).map(({ id }) => `${svg.getAttribute("class") ?? ""}: ${path.getAttribute("data-edge") ?? ""} runs through ${id ?? ""}`);
            });
        }));
        expect(crossed).toEqual([]);
        await page.click(".run .output button");
        const drawn = await page.evaluate(() => document.querySelector(".flow .portrait")?.getAnimations({ subtree: true }).map((animation) =>
        {
            const target = (animation.effect as KeyframeEffect).target as Element;
            return target.closest("[data-node]")?.getAttribute("data-node") ?? target.getAttribute("data-for");
        }) ?? []);
        expect(drawn).toEqual(expect.arrayContaining(["press", "stage", "live", "press>stage", "stage>live"]));
        expect(await page.evaluate(() => document.querySelector(".flow .landscape")?.getAnimations({ subtree: true }).length)).toBe(0);
        await page.setViewportSize({ width: 960, height: 844 });
        expect(await page.isVisible(".flow .portrait")).toBe(true);
        await page.setViewportSize({ width: 961, height: 844 });
        expect(await page.isVisible(".flow .landscape")).toBe(true);
        expect(await page.isVisible(".flow .portrait")).toBe(false);
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
        expect(await shown()).toEqual(["tour-state-panel"]);
        expect(await page.evaluate(() => document.activeElement?.id)).toBe("tour-state");
        expect(await page.textContent("#tour-state-panel code")).toContain("history(draft)");
        await page.click("#tour-server-rendering");
        await page.keyboard.press("ArrowRight");
        expect(await shown()).toEqual(["tour-signals-panel"]);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("keeps every tab of the home page's tour inside the page at every width, and walks them all by arrow key", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/");
        const ids = await page.$$eval(".tour [role=\"tab\"]", (tabs) => tabs.map((tab) => tab.id));
        expect(ids).toEqual(["tour-signals", "tour-templates", "tour-routing", "tour-forms", "tour-state", "tour-browser", "tour-server-rendering"]);
        const [first = "", ...others] = ids;
        const focused = (): Promise<string | undefined> => page.evaluate(() => document.activeElement?.id);
        for (const width of [320, 390, 768, 1024, 1440])
        {
            await page.setViewportSize({ width, height: 800 });
            expect(await page.evaluate(tabsInside), `at ${width} px`).toBe(true);
            await page.focus(`#${first}`);
            for (const id of [...others, first])
            {
                await page.keyboard.press("ArrowRight");
                expect(await focused(), `at ${width} px`).toBe(id);
                expect(await page.getAttribute(`#${id}`, "aria-selected"), `at ${width} px`).toBe("true");
                expect(await page.isVisible(`#${id}-panel`), `at ${width} px`).toBe(true);
            }
            await page.keyboard.press("ArrowLeft");
            expect(await focused(), `at ${width} px`).toBe(others.at(-1));
        }
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

    it("marks a playground example under the pointer without scrolling the list, and scrolls only the list for the keyboard", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/playground/");
        await page.setViewportSize({ width: 1280, height: 520 });
        await page.click(".picker-button");
        const list = page.locator(".picker-list");
        const edge = await list.evaluate((element) =>
        {
            const box = element.getBoundingClientRect();
            const option = [...element.querySelectorAll("[role=\"option\"]")].find((item) => item.getBoundingClientRect().bottom > box.bottom);
            return option === undefined ? null : { id: option.id, x: box.left + 40, y: box.bottom - 8 };
        });
        expect(edge).not.toBeNull();
        await page.mouse.move(edge?.x ?? 0, (edge?.y ?? 0) - 24);
        await page.mouse.move(edge?.x ?? 0, edge?.y ?? 0, { steps: 4 });
        expect(await list.getAttribute("aria-activedescendant")).toBe(edge?.id);
        expect(await list.evaluate((element) => element.scrollTop)).toBe(0);

        const before = await page.evaluate(() => scrollY);
        await page.keyboard.press("End");
        expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        expect(await list.evaluate((element) => (element.querySelector("[role=\"option\"]:last-child")?.getBoundingClientRect().bottom ?? Infinity) <= element.getBoundingClientRect().bottom + 1)).toBe(true);
        expect(await page.evaluate(() => scrollY)).toBe(before);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("keeps the playground's example list inside the page at every width, as wide as its header row allows", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/playground/");
        for (const width of [320, 390, 700, 961, 1280])
        {
            await page.setViewportSize({ width, height: 800 });
            await page.click(".picker-button");
            expect(await page.evaluate(listInside), `at ${width} px`).toBe(true);
            expect(await page.$eval(".picker-list", (list) =>
            {
                const row = list.closest(".head-row")?.getBoundingClientRect();
                const box = list.getBoundingClientRect();
                return row !== undefined && Math.abs(box.width - Math.min(640, Math.floor(row.width))) <= 1 && box.left >= row.left - 1 && box.right <= row.right + 1;
            }), `width at ${width} px`).toBe(true);
            await page.keyboard.press("Escape");
        }
        await page.click(".picker-button");
        await page.setViewportSize({ width: 390, height: 800 });
        await page.waitForFunction(listInside);
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

    it("keeps what the preview stores for the tab through a run and a reload, refuses a write past its quota and storage it did not send, and clears it on Reset", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/playground/");
        const count = [
            "const runs = Number(localStorage.getItem(\"runs\") ?? 0) + 1;",
            "const tab = sessionStorage.getItem(\"tab\");",
            "localStorage.setItem(\"runs\", String(runs));",
            "sessionStorage.setItem(\"tab\", \"kept\");",
            "let refused = \"none\";",
            "try",
            "{",
            "    localStorage.setItem(\"large\", \"x\".repeat(300000));",
            "}",
            "catch (error)",
            "{",
            "    refused = error.name;",
            "}",
            "console.log([runs, String(tab), refused, localStorage.length].join(\" \"));"
        ].join("\n");
        const forged = [
            "parent.postMessage({ playgroundStorage: { local: [[\"runs\", \"100\"]], session: [[\"tab\", 7]] } }, \"*\");",
            "parent.postMessage({ playgroundStorage: { local: [[\"runs\", \"100\"], [\"large\", \"x\".repeat(300000)]], session: [] } }, \"*\");",
            "parent.postMessage({ playgroundStorage: { local: [[\"runs\", 100]], session: [] } }, \"*\");",
            "parent.postMessage({ playgroundStorage: \"runs=100\" }, \"*\");",
            "console.log(\"sent\");"
        ].join("\n");
        const lines = (): Promise<string[]> => page.$$eval(".console p", (items) => items.map((item) => item.textContent ?? ""));
        const runProgram = async (program: string): Promise<void> =>
        {
            await page.fill("textarea[name=\"code\"]", program);
            await page.click("[data-action=\"run\"]");
        };
        await runProgram(count);
        await expect.poll(lines).toEqual(["1 null QuotaExceededError 1"]);
        await page.click("[data-action=\"run\"]");
        await expect.poll(lines).toEqual(["2 kept QuotaExceededError 1"]);
        await page.reload();
        await runProgram(count);
        await expect.poll(lines).toEqual(["3 kept QuotaExceededError 1"]);
        await runProgram(forged);
        await expect.poll(lines).toEqual(["sent"]);
        await page.evaluate(() => new Promise<void>((resolve) =>
        {
            addEventListener("message", () => resolve(), { once: true });
            postMessage({ playgroundStorage: { local: [["runs", "100"]], session: [] } }, "*");
        }));
        await runProgram(count);
        await expect.poll(lines).toEqual(["4 kept QuotaExceededError 1"]);
        await page.click("[data-action=\"reset\"]");
        await runProgram(count);
        await expect.poll(lines).toEqual(["1 null QuotaExceededError 1"]);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("keeps the saved state example's notes through a run and a reload, with undo, a search that waits for a pause, and Reset to start over", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/playground/#example=saved");
        const frame = page.frameLocator(".preview iframe");
        const titles = async (): Promise<string[]> => (await frame.locator("li button").allTextContents()).map((title) => title.trim());
        const undo = frame.locator("button", { hasText: "Undo" });
        await expect.poll(titles).toEqual(["Passport", "Camping", "Porto"]);
        await frame.locator("button", { hasText: "New" }).click();
        await frame.locator("textarea").fill("Sunscreen\nThe tall bottle.");
        await expect.poll(titles).toEqual(["Sunscreen", "Passport", "Camping", "Porto"]);
        expect(await undo.isDisabled()).toBe(false);
        await page.click("[data-action=\"run\"]");
        await expect.poll(() => undo.isDisabled()).toBe(true);
        expect(await titles()).toEqual(["Sunscreen", "Passport", "Camping", "Porto"]);
        await page.reload();
        await expect.poll(titles).toEqual(["Sunscreen", "Passport", "Camping", "Porto"]);
        await frame.locator("li button", { hasText: "Camping" }).click();
        expect(await frame.locator("li button[aria-current=\"true\"]").textContent()).toContain("Camping");
        await frame.locator("button", { hasText: "Delete" }).click();
        await expect.poll(titles).toEqual(["Sunscreen", "Passport", "Porto"]);
        await undo.click();
        await expect.poll(titles).toEqual(["Sunscreen", "Passport", "Camping", "Porto"]);
        await frame.locator("input[type=\"search\"]").pressSequentially("port");
        await expect.poll(titles).toEqual(["Passport", "Porto"]);
        await expect.poll(() => page.$$eval(".console p", (items) => items.map((item) => item.textContent))).toEqual(["Searching for \"port\""]);
        await page.click("[data-action=\"reset\"]");
        await expect.poll(titles).toEqual(["Passport", "Camping", "Porto"]);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("tries the retry example's flaky service three times on each request, one started midway through another included, shows the timeout on each try when one retry is all it has, and gives up at once on a 404", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/playground/#example=retry");
        const frame = page.frameLocator(".preview iframe");
        const status = (): Promise<string | null> => frame.locator(".status").textContent();
        const runs = (): Promise<string | null> => frame.locator(".runs").textContent();
        const calls = (): Promise<string[]> => page.$$eval(".console p", (items) => items.map((item) => (item.textContent ?? "").replace(/^[\d.]+ s: /, "")));
        const failing = ["call 1 gets a 503", "call 2 gets no answer"];
        const request = [...failing, "call 3 goes through"];
        await expect.poll(status, { timeout: 10000 }).toBe("status: resolved");
        expect(await runs()).toBe("3 of 3");
        expect(await frame.locator(".place").textContent()).toBe("Lisbon, Portugal");
        expect(await calls()).toEqual(request);
        await frame.locator("button", { hasText: "Reload" }).click();
        await expect.poll(calls, { timeout: 5000 }).toEqual([...request, ...failing]);
        await frame.locator("button", { hasText: "Reload" }).click();
        await expect.poll(status, { timeout: 10000 }).toBe("status: resolved");
        expect(await runs()).toBe("3 of 3");
        expect(await calls()).toEqual([...request, ...failing, ...request]);
        const code = await page.inputValue("textarea[name=\"code\"]");
        expect(code).toContain("const RETRIES = 2;");
        expect(code).toContain("const STATUS = 503;");
        await page.fill("textarea[name=\"code\"]", code.replace("const RETRIES = 2;", "const RETRIES = 1;"));
        await page.click("[data-action=\"run\"]");
        await expect.poll(status, { timeout: 10000 }).toBe("status: error");
        expect(await runs()).toBe("2 of 2");
        expect(await frame.locator("[role=\"alert\"]").textContent()).toContain("The service did not answer within a second.");
        expect(await calls()).toEqual(failing);
        await frame.locator("button", { hasText: "Try again" }).click();
        await expect.poll(calls, { timeout: 5000 }).toEqual([...failing, ...failing]);
        await expect.poll(status, { timeout: 5000 }).toBe("status: error");
        expect(await runs()).toBe("2 of 2");
        await page.fill("textarea[name=\"code\"]", code.replace("const STATUS = 503;", "const STATUS = 404;"));
        await page.click("[data-action=\"run\"]");
        await expect.poll(status, { timeout: 10000 }).toBe("status: error");
        expect(await runs()).toBe("1 of 3");
        expect(await frame.locator("[role=\"alert\"]").textContent()).toContain("The service answered 404.");
        expect(await calls()).toEqual(["call 1 gets a 404"]);
        await frame.locator("button", { hasText: "Try again" }).click();
        await expect.poll(calls, { timeout: 5000 }).toEqual(["call 1 gets a 404", "call 1 gets a 404"]);
        await expect.poll(status, { timeout: 5000 }).toBe("status: error");
        expect(await runs()).toBe("1 of 3");
        expect(errors).toEqual([]);
        await page.close();
    });

    it("shows the browser example's window and box sizes, the badge in view once all of it shows in its box and out of view with half of it hidden, and the network going offline", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/playground/#example=browser");
        const frame = page.frameLocator(".preview iframe");
        const reading = (label: string): Promise<string | null> => frame.locator("dl > div").filter({ has: frame.locator("dt", { hasText: label }) }).locator("dd").textContent();
        await expect.poll(() => reading("Badge")).toBe("Out of view");
        const size = await frame.locator("body").evaluate(() => `${innerWidth} × ${innerHeight} px`);
        expect(await reading("Window")).toBe(size);
        expect(await reading("Box")).toMatch(/^[1-9]\d* × [1-9]\d* px$/);
        expect(await reading("Network")).toBe("Online");
        expect(await reading("Page")).toMatch(/^Shown for \d+ s$/);
        await frame.locator(".box").evaluate((box) => box.scrollTo(0, box.scrollHeight));
        await expect.poll(() => reading("Badge")).toBe("In view");
        await frame.locator(".badge").evaluate((badge) =>
        {
            const box = badge.parentElement as HTMLElement;
            const shown = badge.getBoundingClientRect();
            const edge = box.getBoundingClientRect().top + box.clientTop + box.clientHeight;
            box.scrollBy(0, shown.top + shown.height / 2 - edge);
        });
        await expect.poll(() => reading("Badge")).toBe("Out of view");
        await page.setViewportSize({ width: 1000, height: 700 });
        await expect.poll(() => reading("Window")).not.toBe(size);
        await page.context().setOffline(true);
        await expect.poll(() => reading("Network")).toBe("Offline");
        await page.context().setOffline(false);
        await expect.poll(() => reading("Network")).toBe("Online");
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
        expect(first).toContain("href=\"/learn/packing-list/\" rel=\"next\"");
        const last = await readFile(join(site, "learn", "packing-list", "ship", "index.html"), "utf8");
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

    it("opens the menu on a phone as a sheet in place of the page, marks the current section, and closes it where the reader was", { timeout: 60000 }, async () =>
    {
        const { page: wide } = await open("/guide/signals/");
        expect(await wide.isVisible(".sheet")).toBe(false);
        expect(await wide.isVisible(".menu-toggle")).toBe(false);
        await wide.close();
        const { page, errors } = await open("/guide/signals/", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const menu = page.locator(".menu-toggle");
        const scrolled = (): Promise<number> => page.evaluate(() => Math.round(scrollY));
        const opened = (): Promise<boolean> => page.evaluate(() => document.documentElement.hasAttribute("data-menu-open"));
        expect(await menu.isVisible()).toBe(true);
        expect(await menu.textContent()).toBe("Menu");
        await page.evaluate(() => scrollTo(0, 600));
        await menu.dispatchEvent("click");
        expect(await menu.getAttribute("aria-expanded")).toBe("true");
        expect(await page.isVisible(".menu-toggle .close-icon")).toBe(true);
        expect(await page.isVisible("main")).toBe(false);
        expect(await page.isVisible("#sidebar")).toBe(true);
        expect(await page.textContent(".sheet a[aria-current=\"true\"]")).toBe("Guide");
        expect(await page.evaluate(() => scrollY === 0 && document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await page.keyboard.press("Escape");
        expect(await menu.getAttribute("aria-expanded")).toBe("false");
        expect(await page.evaluate(() => document.activeElement?.classList.contains("menu-toggle"))).toBe(true);
        expect(await page.isVisible(".sheet")).toBe(false);
        expect(await page.isVisible("main")).toBe(true);
        expect(await scrolled()).toBe(600);

        await menu.dispatchEvent("click");
        await menu.dispatchEvent("click");
        expect(await opened()).toBe(false);
        expect(await scrolled()).toBe(600);

        await menu.dispatchEvent("click");
        await page.focus(".skip");
        await page.keyboard.press("Enter");
        expect(await opened()).toBe(false);
        expect(await page.evaluate(() => location.hash)).toBe("#content");

        await menu.dispatchEvent("click");
        await page.click("#sidebar a[aria-current=\"page\"]");
        expect(await opened()).toBe(false);
        expect(await menu.getAttribute("aria-expanded")).toBe("false");
        await menu.dispatchEvent("click");
        expect(await opened()).toBe(true);
        await menu.dispatchEvent("click");
        const theme = (): Promise<string> => page.evaluate(() => document.documentElement.getAttribute("data-theme") ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
        const before = await theme();
        await page.locator(".theme-toggle").dispatchEvent("click");
        expect(await theme()).not.toBe(before);

        await page.evaluate(() => scrollTo(0, 600));
        await menu.dispatchEvent("click");
        await page.click(".sheet a[href=\"/learn/\"]");
        await page.waitForFunction(() => document.querySelector(".sheet a[aria-current]")?.textContent === "Learn");
        expect(await opened()).toBe(false);
        expect(await page.isVisible("main")).toBe(true);
        await page.goBack();
        await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Signals");
        await page.waitForFunction(() => Math.round(scrollY) === 600);

        await page.locator(".pager .next").dispatchEvent("click");
        await page.waitForFunction(() => document.querySelector("h1")?.textContent !== "Signals");
        await menu.dispatchEvent("click");
        await page.goBack();
        await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Signals");
        await page.waitForFunction(() => Math.round(scrollY) === 600);
        expect(await opened()).toBe(false);

        await menu.dispatchEvent("click");
        await page.setViewportSize({ width: 1280, height: 844 });
        await page.waitForFunction(() => !document.documentElement.hasAttribute("data-menu-open"));
        expect(await scrolled()).toBe(600);

        await page.setViewportSize({ width: 320, height: 640 });
        expect(await page.evaluate(() =>
        {
            const [logo, button, toggle] = [".home svg", ".menu-toggle", ".theme-toggle"].map((selector) => document.querySelector(selector)?.getBoundingClientRect());
            return logo !== undefined && button !== undefined && toggle !== undefined && logo.right + 8 <= button.left && button.right + 8 <= toggle.left && toggle.right <= document.documentElement.clientWidth - 16;
        })).toBe(true);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("ends every page with the site footer and its legal links, and serves the legal pages behind them", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/");
        for (const path of ["/", "/guide/signals/", "/playground/"])
        {
            await page.goto(`${origin}${path}`);
            const links = await page.$$eval(".site-foot nav a", (anchors) => anchors.map((anchor) => anchor.textContent));
            expect(links, path).toEqual(expect.arrayContaining(["Privacy", "Terms of use", "Contact", "License", "Security", "Code of conduct"]));
        }
        for (const [path, title] of [["/legal/privacy/", "Privacy"], ["/legal/terms/", "Terms of use"], ["/legal/contact/", "Contact"]])
        {
            await page.goto(`${origin}${path}`);
            expect(await page.textContent("h1")).toBe(title);
            expect(await page.textContent("#sidebar")).toContain("Terms of use");
        }
        expect(errors).toEqual([]);
        await page.close();
    });

    it("loads nothing from another origin and sets no cookie, as the privacy page says", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/");
        const foreign: string[] = [];
        page.on("request", (request) =>
        {
            const url = new URL(request.url());
            if (/^https?:$/.test(url.protocol) && url.origin !== origin)
            {
                foreign.push(request.url());
            }
        });
        for (const path of ["/", "/learn/", "/guide/signals/", "/reference/zerolith/", "/playground/", "/benchmarks/", "/legal/privacy/"])
        {
            await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
        }
        expect(foreign).toEqual([]);
        expect(await page.context().cookies()).toEqual([]);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("follows the code that runs in the home figure's code pane, and leaves the pane alone while the reader is in it", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/");
        await page.setViewportSize({ width: 1440, height: 900 });
        const pane = page.locator(".figure .code pre");
        const shown = (block: string) => pane.evaluate((element, name) =>
        {
            const box = element.getBoundingClientRect();
            const lines = Array.from(element.querySelectorAll(`[data-run~="${name}"]`), (line) => line.getBoundingClientRect());
            const top = lines[0]?.top ?? -Infinity;
            const bottom = lines.at(-1)?.bottom ?? Infinity;
            return top >= box.top - 1 && (bottom <= box.bottom + 1 || bottom - top > element.clientHeight);
        }, block);
        expect(await shown("clock")).toBe(false);
        await page.click(".run .output button");
        await expect.poll(() => shown("clock")).toBe(true);
        await expect.poll(async () => (await shown("readout-countdown")) && (await shown("tick-countdown")), { timeout: 5000 }).toBe(true);
        await page.waitForFunction(() => document.querySelector(".run .output .display")?.textContent?.endsWith("km") === true, null, { timeout: 10000 });
        await expect.poll(() => shown("tick-flight"), { timeout: 5000 }).toBe(true);
        await page.click(".run .output button");
        await expect.poll(() => shown("press")).toBe(true);

        await pane.focus();
        await pane.evaluate((element) =>
        {
            element.scrollTop = 0;
        });
        await page.$eval(".run .output button", (button) => (button as HTMLButtonElement).click());
        await page.waitForTimeout(1500);
        expect(await pane.evaluate((element) => element.scrollTop)).toBe(0);
        expect(errors).toEqual([]);
        await page.close();
    });

    it("scrolls the page past the home figure's code until the reader clicks into the code", { timeout: 60000 }, async () =>
    {
        const { page, errors } = await open("/");
        await page.setViewportSize({ width: 1600, height: 900 });
        await page.waitForFunction(() => document.documentElement.classList.contains("lenis"));
        const pane = page.locator(".figure .code pre");
        await pane.hover();
        await page.mouse.wheel(0, 300);
        await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(300);
        expect(await pane.evaluate((element) => element.scrollTop)).toBe(0);

        const box = await pane.boundingBox();
        expect(box).not.toBeNull();
        await page.mouse.click((box?.x ?? 0) + 40, (box?.y ?? 0) + 40);
        expect(await pane.evaluate((element) => element === document.activeElement)).toBe(true);
        await page.mouse.wheel(0, 200);
        await expect.poll(() => pane.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        expect(await page.evaluate(() => Math.round(scrollY))).toBe(300);
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

    it("paints in the brand's fonts from the first frame, with no font to fetch and no reflow when one lands", { timeout: 60000 }, async () =>
    {
        const fonts = await readFile(join(site, "fonts.css"), "utf8");
        expect(fonts.match(/font-display: block;\s+src: url\("data:font\/woff2;base64,/g)).toHaveLength(3);
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const fetched: string[] = [];
        page.on("request", (request) =>
        {
            if (request.resourceType() === "font")
            {
                fetched.push(request.url());
            }
        });
        await page.addInitScript(() =>
        {
            const faces: { at: Array<string[]> } = { at: [] };
            const decoding: string[] = [];
            Object.assign(window, { paintedFaces: faces, decoding, reflow: 0 });
            const load = FontFace.prototype.load;
            FontFace.prototype.load = function(this: FontFace)
            {
                if (document.body === null)
                {
                    decoding.push(this.family.replace(/"/g, ""));
                }
                return load.call(this);
            };
            new PerformanceObserver(() =>
            {
                faces.at.push([...document.fonts].map((font) => `${font.family} ${font.status}`));
            }).observe({ type: "paint", buffered: true });
            new PerformanceObserver((list) =>
            {
                for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number }>)
                {
                    Object.assign(window, { reflow: (window as unknown as { reflow: number }).reflow + entry.value });
                }
            }).observe({ type: "layout-shift", buffered: true });
        });
        await page.goto(`${origin}/guide/`, { waitUntil: "load" });
        await page.waitForTimeout(500);
        const seen = await page.evaluate(() =>
        {
            const { paintedFaces, decoding, reflow } = window as unknown as { paintedFaces: { at: string[][] }; decoding: string[]; reflow: number };
            return { first: paintedFaces.at[0], decoding, reflow, heading: getComputedStyle(document.querySelector("h1") as Element).fontFamily };
        });
        expect(fetched).toEqual([]);
        expect(seen.decoding.toSorted()).toEqual(["Martian Mono", "Onest", "Unbounded"]);
        expect(seen.heading).toContain("Unbounded");
        expect(seen.first?.filter((face) => face.startsWith("Unbounded") || face.startsWith("Onest"))).toEqual(["Unbounded loaded", "Onest loaded"]);
        expect(seen.reflow).toBeLessThan(0.01);
        await page.close();
    });

    it("keeps the fonts in a stylesheet of their own, whose address follows the fonts alone, so a change to the site's styles leaves them cached", async () =>
    {
        const head = await readFile(join(site, "guide", "index.html"), "utf8");
        const fonts = await readFile(join(site, "fonts.css"));
        const styles = await readFile(join(site, "styles.css"));
        expect(head).toContain(`<link rel="stylesheet" href="/fonts.css?v=${addressVersion(fonts)}">\n<link rel="stylesheet" href="/styles.css?v=${addressVersion(styles)}">`);
        expect(styles.toString("utf8")).not.toContain("@font-face");
        expect(fonts.toString("utf8").replace(/url\("data:[^"]+"\)/g, "")).not.toMatch(/[{;]\s*(?!font-|src:)[a-z-]+:/);
    });

    it("keeps a page styled when a browser holds a copy of the stylesheet or the theme script from another deploy", { timeout: 60000 }, async () =>
    {
        const head = await readFile(join(site, "guide", "index.html"), "utf8");
        const stylesheet = /<link rel="stylesheet" href="\/styles\.css\?v=[\w-]+">/.exec(head);
        expect(stylesheet, "a versioned stylesheet with no integrity hash").not.toBeNull();
        expect(head).toMatch(/<script src="\/theme\.js\?v=[\w-]+"><\/script>/);
        expect(head).not.toContain("rel=\"preload\" href=\"/fonts/");
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("console", (message) =>
        {
            if (message.type() === "error")
            {
                errors.push(message.text());
            }
        });
        await page.addInitScript(() => localStorage.setItem("zerolith-docs-theme", "dark"));
        for (const pattern of ["**/fonts.css*", "**/styles.css*", "**/theme.js*"])
        {
            await page.route(pattern, async (route) =>
            {
                const response = await route.fetch();
                await route.fulfill({ response, body: `${await response.text()}\n/* from another deploy */\n` });
            });
        }
        await page.goto(`${origin}/guide/`, { waitUntil: "load" });
        expect(await page.evaluate(() => getComputedStyle(document.body).margin)).toBe("0px");
        expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
        expect(errors.filter((error) => error.includes("integrity"))).toEqual([]);
        await page.close();
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
        expect(sitemap).toContain("<loc>https://zerolith.dev/learn/packing-list/state/</loc>");
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
            expect(guide.match(/data-version-switch rel="external"/g)).toHaveLength(2);
            expect(guide).toContain("0.0 docs</a>");
            expect(guide).toContain("href=\"/next/styles.css?v=");
            expect(guide).not.toContain("href=\"/styles.css");
            const stableShown = JSON.stringify({ stable: { version: version.version, base: "/" }, next: { version: "9.0.0-alpha.1", base: "/next/" } });
            await run(process.execPath, ["--conditions=development", "scripts/docs/build.ts"], { cwd: repositoryRoot, env: { ...process.env, ZEROLITH_DOCS_OUT: join(scratch, "stable"), ZEROLITH_DOCS_VERSIONS: stableShown } });
            const stable = unmarked(await readFile(join(scratch, "stable", "guide", "index.html"), "utf8"));
            expect(stable).toContain("href=\"/next/guide/\" data-version-switch");
            expect(stable.match(/data-version-switch rel="external"/g)).toHaveLength(2);
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
