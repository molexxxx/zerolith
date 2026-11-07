import { type ChildProcess, spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { binary, startServer } from "./helpers.ts";

/**
 * Writes the starter `zerolith new` writes by default, TypeScript with JSX
 * on the command line, into this repository's target folder so its
 * packages resolve to this checkout, and runs it the way its README says:
 * under `zerolith dev`, and built by `zerolith build` under `zerolith
 * preview`. Both go through the same pages in headless Chromium.
 */

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const root = join(repository, "target", `starter-${process.pid}`);
const servers: ChildProcess[] = [];
let browser: Browser;

/** Starts a zerolith server on a free port, keeps its process for the cleanup, and resolves with its origin. */
async function start(args: string[]): Promise<string>
{
    const started = await startServer(args);
    servers.push(started.child);
    return started.origin;
}

/** Goes through the three pages and the fallback, returning what a user would check and the errors seen. */
async function visit(origin: string): Promise<Record<string, unknown>>
{
    const page = await browser.newPage();
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("console", (message) =>
    {
        if (message.type() === "error")
        {
            problems.push(message.text());
        }
    });
    await page.goto(`${origin}/`);
    await page.waitForSelector("main h1");
    const heading = await page.textContent("main h1");
    await page.click("text=Try the counter");
    await page.waitForSelector("output");
    await page.click("button.primary");
    await page.click("button.primary");
    const count = await page.textContent("output");
    const current = await page.getAttribute("nav a[aria-current=page]", "href");
    await page.click("nav a[href='/packages']");
    await page.waitForSelector("main li");
    const listed = await page.locator("main li").count();
    await page.fill("input[type=search]", "router");
    const found = await page.locator("main li").count();
    await page.goto(`${origin}/nowhere`);
    await page.waitForSelector("main h1");
    const missing = await page.textContent("main h1");
    const footer = await page.textContent("footer");
    await page.close();
    return { heading, count, current, listed, found, missing, footer, problems };
}

const expected = { heading: `starter-${process.pid}`, count: "2", current: "/counter", listed: 13, found: 1, missing: "Not found", footer: "Built with zerolith. Press Alt+Shift+Z for the inspector.", problems: [] };

beforeAll(async () =>
{
    rmSync(root, { recursive: true, force: true });
    const result = spawnSync(binary(), ["new", root, "--yes", "--no-install"], { encoding: "utf8" });
    if (result.status !== 0)
    {
        throw new Error(`zerolith new failed: ${result.stderr}`);
    }
    browser = await chromium.launch();
}, 60000);

afterAll(async () =>
{
    await browser?.close();
    for (const server of servers)
    {
        server.kill();
    }
    rmSync(root, { recursive: true, force: true });
});

describe("the starter zerolith new writes", () =>
{
    it("runs under zerolith dev", { timeout: 60000 }, async () =>
    {
        expect(await visit(await start(["dev", root]))).toEqual(expected);
    });

    it("loads whichever of its modules comes first, the route table or a component", { timeout: 60000 }, async () =>
    {
        const origin = await start(["dev", root]);
        for (const [name, first] of [["routes-first", "/src/routes.ts"], ["component-first", "/src/components/home.tsx"], ["router-first", "/src/router.ts"]] as const)
        {
            const file = join(root, `${name}.html`);
            try
            {
                writeFileSync(file, `<!doctype html><title>${name}</title><script type="module">\nawait import("${first}");\nconst { routes } = await import("/src/routes.ts");\nconst { router } = await import("/src/router.ts");\nawait router.ready;\ndocument.title = Object.keys(routes).join() + " " + router.href("counter");\n</script>\n`);
                const page = await browser.newPage();
                const problems: string[] = [];
                page.on("pageerror", (error) => problems.push(error.message));
                await page.goto(`${origin}/${name}.html`);
                await expect.poll(() => page.title(), { timeout: 10000 }).toBe("home,counter,packages /counter");
                expect(problems, name).toEqual([]);
                await page.close();
            }
            finally
            {
                rmSync(file, { force: true });
            }
        }
    });

    it("prints a module that fails to compile and a stylesheet the browser reads in part in the console under zerolith dev", { timeout: 60000 }, async () =>
    {
        const routes = join(root, "src", "routes.ts");
        const styles = join(root, "src", "styles.css");
        const keptRoutes = readFileSync(routes, "utf8");
        const keptStyles = readFileSync(styles, "utf8");
        try
        {
            writeFileSync(routes, `${keptRoutes}\nexport const broken = ;\n`);
            writeFileSync(styles, `${keptStyles}\n.broken:: { color: red; }\n`);
            const origin = await start(["dev", root]);
            const page = await browser.newPage();
            const printed: string[] = [];
            page.on("console", (message) =>
            {
                if (message.type() === "error" || message.type() === "warning")
                {
                    printed.push(`${message.type()} ${message.text()}`);
                }
            });
            await page.goto(`${origin}/`);
            await expect.poll(() => printed.filter((line) => line.startsWith("error zerolith dev: src/routes.ts:")).length, { timeout: 10000 }).toBe(1);
            await expect.poll(() => printed.filter((line) => line.startsWith("warning zerolith dev: src/styles.css:")).length, { timeout: 10000 }).toBe(1);
            await page.close();
        }
        finally
        {
            writeFileSync(routes, keptRoutes);
            writeFileSync(styles, keptStyles);
        }
    });

    it("passes its own lint with a module imported for its effects, a stylesheet or another module", () =>
    {
        const file = join(root, "src", "effects.ts");
        try
        {
            writeFileSync(file, "import \"./styles.css\";\nimport \"./router.ts\";\n\nexport const ready = true;\n");
            const oxlint = join(repository, "node_modules", "oxlint", "bin", "oxlint");
            const result = spawnSync(process.execPath, [oxlint, "-c", join(root, ".oxlintrc.json"), file], { encoding: "utf8" });
            expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
        }
        finally
        {
            rmSync(file, { force: true });
        }
    });

    it("builds with zerolith build and runs from zerolith preview", { timeout: 60000 }, async () =>
    {
        const result = spawnSync(binary(), ["build", root], { encoding: "utf8" });
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toMatch(/assets\/index-[\w-]+\.js/);
        expect(await visit(await start(["preview", root]))).toEqual({ ...expected, footer: "Built with zerolith." });
    });
});
