import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type Server, createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { binary } from "./helpers.ts";

/**
 * Builds a small project with `zerolith build --unbundled` and serves the
 * output as a host that sets its own cache time does, then builds it again
 * with a changed module and reloads in the same browser, which holds the first
 * build's files. Lives under this repository's target folder so its packages
 * resolve to this checkout.
 */

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const root = join(repository, "target", `unbundled-${process.pid}`);
const out = join(root, "dist");
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const requests: string[] = [];
let server: Server;
let origin: string;
let browser: Browser;

/** Writes the project's changing module, whose export the entry imports by name. */
function writeMessage(name: string, value: string): void
{
    writeFileSync(join(root, "src", "message.js"), `export const ${name} = "${value}";\n`);
    writeFileSync(join(root, "src", "main.js"), `import { signal } from "zerolith";\nimport { ${name} as shown } from "./message.js";\nimport { steady } from "./steady.js";\ndocument.body.dataset.shown = signal(shown).get() + " " + steady;\n`);
}

/** Runs the build, failing with its output when it fails, and returns the hash it prints for the page's import map. */
function build(): string
{
    const result = spawnSync(binary(), ["build", root, "--unbundled", "--no-prepare"], { encoding: "utf8" });
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    return /'(sha256-[^']+)' in script-src/.exec(result.stdout)?.[1] ?? "";
}

beforeAll(async () =>
{
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "index.html"), "<!doctype html><html><head><title>Cached</title><link rel=\"stylesheet\" href=\"/src/styles.css\"><script type=\"module\" src=\"/src/main.js\"></script></head><body></body></html>\n");
    writeFileSync(join(root, "src", "steady.js"), "export const steady = \"steady\";\n");
    writeFileSync(join(root, "src", "styles.css"), "body { margin: 1px; }\n");
    writeMessage("first", "one");
    build();
    server = createServer((request, response) =>
    {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        const path = url.pathname;
        requests.push(request.url ?? "");
        try
        {
            const body = readFileSync(join(out, path === "/" ? "index.html" : path));
            const pinned = url.searchParams.get("pin");
            const policy = pinned === null ? {} : { "content-security-policy": `default-src 'self'; script-src 'self' '${pinned}'` };
            response.writeHead(200, { "content-type": types[extname(path)] ?? "text/html", "cache-control": path === "/" ? "no-cache" : "max-age=600", ...policy }).end(body);
        }
        catch
        {
            response.writeHead(404).end();
        }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;
    browser = await chromium.launch();
}, 60000);

afterAll(async () =>
{
    await browser?.close();
    await new Promise((resolve) => server?.close(resolve));
    rmSync(root, { recursive: true, force: true });
});

describe("zerolith build --unbundled on a host that sets its own cache time", () =>
{
    it("runs a new build across a reload, with the old build's files in the cache, and keeps what did not change cached", { timeout: 60000 }, async () =>
    {
        const context = await browser.newContext();
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${origin}/`);
        await page.waitForFunction(() => document.body.dataset["shown"] !== undefined);
        expect(await page.evaluate(() => document.body.dataset["shown"])).toBe("one steady");
        expect(await page.evaluate(() => getComputedStyle(document.body).margin)).toBe("1px");

        writeMessage("second", "two");
        writeFileSync(join(root, "src", "styles.css"), "body { margin: 2px; }\n");
        build();
        requests.length = 0;
        await page.reload();
        await page.waitForFunction(() => document.body.dataset["shown"] !== undefined);
        expect(await page.evaluate(() => document.body.dataset["shown"])).toBe("two steady");
        expect(await page.evaluate(() => getComputedStyle(document.body).margin)).toBe("2px");
        expect(errors).toEqual([]);
        expect(requests.filter((url) => url.startsWith("/src/message.js"))).toHaveLength(1);
        expect(requests.filter((url) => url.startsWith("/src/steady.js")), "an unchanged module stays cached").toEqual([]);
        await context.close();
    });

    it("prints the hash a Content-Security-Policy needs to allow the import map, which holds for that build alone", { timeout: 60000 }, async () =>
    {
        const stale = build();
        expect(stale).toMatch(/^sha256-/);
        const page = await browser.newPage();
        await page.goto(`${origin}/?pin=${encodeURIComponent(stale)}`);
        await page.waitForFunction(() => document.body.dataset["shown"] !== undefined);
        writeMessage("third", "three");
        const next = build();
        expect(next).not.toBe(stale);
        const refused: string[] = [];
        page.on("console", (message) =>
        {
            if (message.type() === "error")
            {
                refused.push(message.text());
            }
        });
        await page.goto(`${origin}/?pin=${encodeURIComponent(stale)}`);
        await expect.poll(() => refused.some((text) => text.includes("Content Security Policy") || text.includes("Content-Security-Policy"))).toBe(true);
        expect(await page.evaluate(() => document.body.dataset["shown"])).toBeUndefined();
        await page.goto(`${origin}/?pin=${encodeURIComponent(next)}`);
        await page.waitForFunction(() => document.body.dataset["shown"] !== undefined);
        expect(await page.evaluate(() => document.body.dataset["shown"])).toBe("three steady");
        await page.close();
    });

    it("prints the hash of the map zerolith importmap wrote", () =>
    {
        const installed = join(root, "node_modules", "zerolith");
        mkdirSync(join(installed, "dist"), { recursive: true });
        writeFileSync(join(installed, "package.json"), "{\"name\":\"zerolith\",\"version\":\"0.0.0\",\"exports\":{\".\":\"./dist/index.js\"}}");
        writeFileSync(join(installed, "dist", "index.js"), "export const html = 1;\n");
        const result = spawnSync(binary(), ["importmap", root, "--html", "index.html"], { encoding: "utf8" });
        expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
        const written = readFileSync(join(root, "index.html"), "utf8");
        const map = /<script type="importmap">([\s\S]*?)<\/script>/.exec(written)?.[1] ?? "";
        expect(result.stdout).toContain(`'sha256-${createHash("sha256").update(map).digest("base64")}' in script-src`);
    });

    it("says what to do when zerolith preview has no folder to serve", () =>
    {
        const result = spawnSync(binary(), ["preview", root, "--out", "no-such-folder"], { encoding: "utf8" });
        expect(result.status).not.toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain("run zerolith build first");
    });
});
