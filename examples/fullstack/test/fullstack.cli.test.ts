import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zerolithBinary } from "../../../scripts/zerolith.ts";
import { createBackend } from "../server.ts";

/**
 * Runs the fullstack example as its README describes: the backend serves the
 * API, zerolith dev serves the app under /app/ and forwards /api to the
 * backend, zerolith build writes the app for that base, and the backend
 * serves the build itself. The same flow runs in headless Chromium against
 * each setup.
 */

const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "dist");
const children: ChildProcess[] = [];
const backends: ReturnType<typeof createBackend>[] = [];
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

/** Starts the backend on a free port and resolves with its origin. */
function backend(dist?: string): Promise<string>
{
    const server = dist === undefined ? createBackend() : createBackend({ dist });
    backends.push(server);
    return new Promise((resolve) =>
    {
        server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
    });
}

/** Starts a zerolith server on a free port and resolves with its origin once it listens. */
function start(args: string[]): Promise<string>
{
    return new Promise((resolve, reject) =>
    {
        const child = spawn(binary(), [...args, "--port", "0"], { stdio: ["ignore", "pipe", "pipe"] });
        children.push(child);
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

/** Lists the notes, adds one, follows a link, and loads a route directly; returns what went wrong. */
async function exercise(origin: string): Promise<string[]>
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
    try
    {
        await page.goto(`${origin}/`);
        await page.waitForSelector("main li");
        expect(new URL(page.url()).pathname).toBe("/app/");
        expect(await page.locator("main li").count()).toBe(2);
        await page.fill("input[name=text]", "Added through the proxy");
        await page.click("form button");
        await page.waitForFunction(() => document.querySelectorAll("main li").length === 3);
        await page.click("nav a[href='/app/about']");
        await page.waitForSelector("section h1:text('About')");
        expect(new URL(page.url()).pathname).toBe("/app/about");
        await page.goto(`${origin}/app/about`);
        await page.waitForSelector("section h1:text('About')");
        await page.goto(`${origin}/app/nowhere`);
        await page.waitForSelector("section h1:text('Not found')");
        return problems;
    }
    finally
    {
        await page.close();
    }
}

beforeAll(async () =>
{
    browser = await chromium.launch();
}, 60000);

afterAll(async () =>
{
    await browser?.close();
    for (const child of children)
    {
        child.kill();
    }
    for (const server of backends)
    {
        server.close();
    }
    rmSync(out, { recursive: true, force: true });
});

describe("fullstack example", () =>
{
    it("develops under /app/ with the API forwarded to the backend", { timeout: 60000 }, async () =>
    {
        const api = await backend();
        const origin = await start(["dev", root, "--proxy", `/api=${api}`]);
        const notes = await fetch(`${origin}/api/notes`);
        expect(notes.status).toBe(200);
        expect(await notes.json()).toHaveLength(2);
        expect(await exercise(origin)).toEqual([]);
    });

    it("builds for /app/ and runs from the backend and from zerolith preview", { timeout: 90000 }, async () =>
    {
        const result = spawnSync(binary(), ["build", root], { encoding: "utf8" });
        expect(result.status, result.stderr).toBe(0);
        const page = readFileSync(join(out, "index.html"), "utf8");
        expect(page).toMatch(/<script type="module" src="\/app\/assets\/index-[\w-]+\.js"><\/script>/);
        expect(page).toMatch(/<link rel="stylesheet" href="\/app\/assets\/index-[\w-]+\.css">/);

        const production = await backend(out);
        const script = /src="(\/app\/assets\/index-[\w-]+\.js)"/.exec(page)?.[1] ?? "";
        const asset = await fetch(`${production}${script}`);
        expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect((await fetch(`${production}/app/about`)).headers.get("cache-control")).toBe("no-cache");
        expect(await exercise(production)).toEqual([]);

        const api = await backend();
        const preview = await start(["preview", root, "--proxy", `/api=${api}`]);
        expect(await exercise(preview)).toEqual([]);
    });
});
