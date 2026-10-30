import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zerolithBinary } from "../../../scripts/zerolith.ts";
import { exercise } from "./flow.ts";

/**
 * Runs the notes example the way a project runs: `zerolith dev` serves the
 * sources with the packages resolved from node_modules and no import map,
 * and `zerolith build` bundles them for `zerolith preview`. Both are driven
 * through the same flow in headless Chromium.
 */

const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "dist");
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

beforeAll(async () =>
{
    browser = await chromium.launch();
}, 60000);

afterAll(async () =>
{
    await browser?.close();
    for (const server of servers)
    {
        server.kill();
    }
    rmSync(out, { recursive: true, force: true });
});

describe("notes example on the zerolith command line", () =>
{
    it("runs under zerolith dev with one module script and no import map", { timeout: 60000 }, async () =>
    {
        const origin = await start(["dev", root]);
        const page = await (await fetch(`${origin}/`)).text();
        expect(page).not.toContain("importmap");
        expect(await exercise(browser, origin)).toEqual([]);
    });

    it("bundles with zerolith build and runs from zerolith preview", { timeout: 60000 }, async () =>
    {
        const result = spawnSync(binary(), ["build", root], { encoding: "utf8" });
        expect(result.status, result.stderr).toBe(0);
        const assets = readdirSync(join(out, "assets"));
        expect(assets.filter((name) => name.endsWith(".js"))).toHaveLength(1);
        expect(assets.filter((name) => name.endsWith(".css"))).toHaveLength(1);
        expect(readFileSync(join(out, "data", "notes.json"), "utf8")).toContain("Routing");
        const page = readFileSync(join(out, "index.html"), "utf8");
        expect(page).toMatch(/<script type="module" src="\/assets\/index-[\w-]+\.js"><\/script>/);
        expect(page).not.toContain("importmap");
        const origin = await start(["preview", root]);
        expect(await exercise(browser, origin)).toEqual([]);
    });
});
