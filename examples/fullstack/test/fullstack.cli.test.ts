import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zerolithBinary } from "../../../scripts/zerolith.ts";
import { createApp } from "../server/app.ts";
import { serve } from "../server/node.ts";

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
const backends: Server[] = [];
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
async function backend(dist?: string): Promise<string>
{
    const server = await serve(createApp(dist === undefined ? {} : { dist }), 0);
    backends.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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

/**
 * Signs in, reads the dashboard, creates a project, opens a project's board,
 * adds a task to it, and loads a route and a missing page directly; returns
 * what went wrong. The 401 the page gets while nobody is signed in is the
 * expected answer, so it is not counted.
 */
async function exercise(origin: string): Promise<string[]>
{
    const page = await browser.newPage();
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("console", (message) =>
    {
        if (message.type() === "error" && !message.text().includes("status of 401"))
        {
            problems.push(message.text());
        }
    });
    try
    {
        await page.goto(`${origin}/`);
        await page.waitForSelector("form[action='/api/session']");
        expect(new URL(page.url()).pathname).toBe("/app/");
        await page.fill("input[name=email]", "ada@harbor.test");
        await page.fill("input[name=password]", "analytical");
        await page.click("form button.primary");
        await page.waitForSelector("h1:text('Welcome back, Ada.')");
        expect(await page.locator(".stat .value").count()).toBe(4);
        await page.click("nav a[href='/app/projects']");
        await page.waitForSelector("h1:text('3 in motion.')");
        await page.fill("input[name=name]", "Launch party");
        await page.click("form button.primary");
        await page.waitForSelector("li h2:text('Launch party')");
        await page.click("li a:has(h2:text('Website relaunch'))");
        await page.waitForSelector("h1:text('Website relaunch')");
        expect(await page.title()).toBe("Website relaunch | Harbor");
        await page.fill("input[name=title]", "Order the banners");
        await page.click("form button.primary");
        await page.waitForSelector(".task h3:text('Order the banners')");
        await page.goto(`${origin}/app/projects/2`);
        await page.waitForSelector("h1:text('Mobile app')");
        await page.goto(`${origin}/app/nowhere`);
        await page.waitForSelector("h1:text('Nothing here.')");
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
        const session = await fetch(`${origin}/api/session`);
        expect(session.status).toBe(401);
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
        expect((await fetch(`${production}/app/projects`)).headers.get("cache-control")).toBe("no-cache");
        expect(await exercise(production)).toEqual([]);

        const api = await backend();
        const preview = await start(["preview", root, "--proxy", `/api=${api}`]);
        expect(await exercise(preview)).toEqual([]);
    });
});
