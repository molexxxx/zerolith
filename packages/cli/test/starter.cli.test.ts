import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zerolithBinary } from "../../../scripts/zerolith.ts";

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

function binary(): string
{
    const found = zerolithBinary();
    if (found === undefined)
    {
        throw new Error("No zerolith binary: run cargo build, or set ZEROLITH_BINARY_PATH");
    }
    return found;
}

/** Starts a zerolith server on a free port and resolves with its origin once it listens. */
function start(args: string[]): Promise<string>
{
    return new Promise((resolve, reject) =>
    {
        const child = spawn(binary(), [...args, "--port", "0"], { stdio: ["ignore", "pipe", "pipe"] });
        servers.push(child);
        let output = "";
        const read = (chunk: Buffer): void =>
        {
            output += chunk.toString();
            const origin = /http:\/\/127\.0\.0\.1:\d+/.exec(output)?.[0];
            if (origin !== undefined)
            {
                resolve(origin);
            }
        };
        child.stdout?.on("data", read);
        child.stderr?.on("data", read);
        child.on("exit", (code) => reject(new Error(`zerolith exited with ${String(code)}: ${output}`)));
    });
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
    await page.close();
    return { heading, count, current, listed, found, missing, problems };
}

const expected = { heading: `starter-${process.pid}`, count: "2", current: "/counter", listed: 11, found: 1, missing: "Not found", problems: [] };

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

    it("builds with zerolith build and runs from zerolith preview", { timeout: 60000 }, async () =>
    {
        const result = spawnSync(binary(), ["build", root], { encoding: "utf8" });
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toMatch(/assets\/index-[\w-]+\.js/);
        expect(await visit(await start(["preview", root]))).toEqual(expected);
    });
});
