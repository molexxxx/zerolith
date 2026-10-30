import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { type Server, createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { answer, createTaskApi } from "../server.ts";
import { exercise } from "./flow.ts";

/**
 * Builds the example with `zerolith build`, the command line's own bundler,
 * serves the output from a plain Node server with the task API next to it,
 * the way any backend serves a built frontend, and drives it through the
 * same flow as the Vite test.
 */

const root = fileURLToPath(new URL("../", import.meta.url));
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const executable = process.platform === "win32" ? "zerolith.exe" : "zerolith";

const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".json": "application/json"
};

/** The binary ZEROLITH_BINARY_PATH names, or else the newer of the release and debug builds, so a stale one is never tested. */
function binary(): string
{
    const configured = process.env["ZEROLITH_BINARY_PATH"];
    if (configured !== undefined)
    {
        return configured;
    }
    const [newest] = ["release", "debug"]
        .map((profile) => join(repository, "target", profile, executable))
        .filter((path) => existsSync(path))
        .toSorted((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (newest === undefined)
    {
        throw new Error("No zerolith binary: run cargo build, or set ZEROLITH_BINARY_PATH");
    }
    return newest;
}

let out: string;
let printed: string;
let server: Server;
let browser: Browser;
let origin: string;

beforeAll(async () =>
{
    out = mkdtempSync(join(tmpdir(), "zerolith-tasks-"));
    const result = spawnSync(binary(), ["build", root, "--out", out], { encoding: "utf8" });
    if (result.status !== 0)
    {
        throw new Error(`zerolith build failed: ${result.stderr}`);
    }
    printed = result.stdout;
    const api = createTaskApi();
    server = createServer((request, response) =>
    {
        answer(api, request, response)
            .then((answered) =>
            {
                if (answered)
                {
                    return;
                }
                const path = new URL(request.url ?? "/", "http://localhost").pathname;
                const file = join(out, path);
                const target = extname(path) !== "" && existsSync(file) ? file : join(out, "index.html");
                response.setHeader("content-type", types[extname(target)] ?? "application/octet-stream");
                response.end(readFileSync(target));
            })
            .catch((error: unknown) =>
            {
                response.statusCode = 500;
                response.end(String(error));
            });
    });
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
