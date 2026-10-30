import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zerolithBinary } from "../../../scripts/zerolith.ts";
import { createPreviewServer } from "../preview.ts";
import { exercise } from "./flow.ts";

/**
 * Builds the example with `zerolith build`, the command line's own bundler,
 * serves the output from the plain Node server in preview.ts with the task
 * API next to it, the way any backend serves a built frontend, and drives
 * it through the same flow as the Vite test.
 */

const root = fileURLToPath(new URL("../", import.meta.url));

let out: string;
let printed: string;
let server: Server;
let browser: Browser;
let origin: string;

beforeAll(async () =>
{
    const binary = zerolithBinary();
    if (binary === undefined)
    {
        throw new Error("No zerolith binary: run cargo build, or set ZEROLITH_BINARY_PATH");
    }
    out = mkdtempSync(join(tmpdir(), "zerolith-tasks-"));
    const result = spawnSync(binary, ["build", root, "--out", out, "--empty-out-dir"], { encoding: "utf8" });
    if (result.status !== 0)
    {
        throw new Error(`zerolith build failed: ${result.stderr}`);
    }
    printed = result.stdout;
    server = createPreviewServer(out);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
    browser = await chromium.launch();
}, 120000);

afterAll(async () =>
{
    await browser?.close();
    await new Promise((resolve) => server?.close(resolve));
    rmSync(out, { recursive: true, force: true });
});

describe("tasks example bundled by zerolith build", () =>
{
    it("writes hashed chunks with prepared templates, one stylesheet, and a page that loads them", () =>
    {
        const assets = readdirSync(join(out, "assets"));
        for (const chunk of [/^index-[\w-]+\.js$/, /^en-[\w-]+\.js$/, /^de-[\w-]+\.js$/, /^index-[0-9a-f]+\.css$/])
        {
            expect(assets.filter((name) => chunk.test(name))).toHaveLength(1);
        }
        const page = readFileSync(join(out, "index.html"), "utf8");
        expect(page).toMatch(/<script type="module" src="\/assets\/index-[\w-]+\.js"><\/script>/);
        expect(page).toMatch(/<link rel="stylesheet" href="\/assets\/index-[0-9a-f]+\.css">/);
        const code = assets.filter((name) => name.endsWith(".js")).map((name) => readFileSync(join(out, "assets", name), "utf8")).join("\n");
        expect(code).toContain("<!--zl$-->");
        expect(printed).toMatch(/assets\/index-[\w-]+\.js +\d+\.\d\d kB/);
    });

    it("lists, creates, deletes, validates, and switches languages without console errors", { timeout: 90000 }, async () =>
    {
        const context = await browser.newContext({ locale: "en-US" });
        expect(await exercise(context, origin)).toEqual([]);
        await context.close();
    });
});
