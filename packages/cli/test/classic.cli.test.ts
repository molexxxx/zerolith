import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { type Server, createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { binary } from "./helpers.ts";

/**
 * Builds one module with `zerolith build --entry --classic` and loads the
 * script every way a page can load a plain script, reading what the script
 * saw as `import.meta.url`. Lives under this repository's target folder.
 */

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const root = join(repository, "target", `classic-${process.pid}`);
let script: string;
let server: Server;
let origin: string;
let browser: Browser;

/** The page at `path` of the test server, loaded, and the address its script resolved `./data.json` to. */
async function resolved(path: string): Promise<string>
{
    const tab = await browser.newPage();
    try
    {
        await tab.goto(`${origin}${path}`);
        await tab.waitForFunction(() => document.body.dataset["data"] !== undefined, undefined, { timeout: 10000 });
        return await tab.evaluate(() => document.body.dataset["data"] ?? "");
    }
    finally
    {
        await tab.close();
    }
}

beforeAll(async () =>
{
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "main.ts"), "const data: string = new URL(\"./data.json\", import.meta.url).href;\nconst show = (): void =>\n{\n    document.body.dataset[\"data\"] = data;\n};\nif (document.body === null)\n{\n    document.addEventListener(\"DOMContentLoaded\", show);\n}\nelse\n{\n    show();\n}\n");
    const result = spawnSync(binary(), ["build", root, "--entry", "src/main.ts", "--name", "widget", "--classic", "--no-prepare"], { encoding: "utf8" });
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    script = readFileSync(join(root, "dist", "widget.js"), "utf8");
    const pages: Record<string, string> = {
        "/pages/linked.html": "<!doctype html><html><head><script src=\"/scripts/widget.js\"></script></head><body></body></html>",
        "/pages/deferred.html": "<!doctype html><html><head><script defer src=\"/scripts/widget.js\"></script></head><body></body></html>",
        "/pages/async.html": "<!doctype html><html><head><script async src=\"/scripts/widget.js\"></script></head><body></body></html>",
        "/pages/injected.html": "<!doctype html><html><head></head><body><script>const made = document.createElement(\"script\"); made.src = \"/scripts/widget.js\"; document.head.append(made);</script></body></html>",
        "/pages/inline.html": `<!doctype html><html><head></head><body><script>${script}</script></body></html>`,
        "/pages/based.html": `<!doctype html><html><head><base href="/assets/"></head><body><script>${script}</script></body></html>`,
        "/pages/named.html": "<!doctype html><html><head></head><body><img name=\"currentScript\" src=\"/elsewhere/pixel.png\"><form name=\"baseURI\"></form><script src=\"/scripts/widget.js\"></script></body></html>",
        "/pages/named-inline.html": `<!doctype html><html><head></head><body><img name="currentScript" src="/elsewhere/pixel.png"><form name="baseURI"></form><script>${script}</script></body></html>`
    };
    server = createServer((request, response) =>
    {
        const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
        const page = pages[path];
        if (path === "/scripts/widget.js")
        {
            response.writeHead(200, { "content-type": "text/javascript" }).end(script);
        }
        else if (page !== undefined)
        {
            response.writeHead(200, { "content-type": "text/html" }).end(page);
        }
        else
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
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
    rmSync(root, { recursive: true, force: true });
});

describe("zerolith build --classic", () =>
{
    it("gives import.meta.url the script's own address however a page loads the file", { timeout: 60000 }, async () =>
    {
        for (const page of ["linked", "deferred", "async", "injected"])
        {
            expect(await resolved(`/pages/${page}.html`), page).toBe(`${origin}/scripts/data.json`);
        }
    });

    it("gives import.meta.url the page's base address when the script is written into the page", { timeout: 60000 }, async () =>
    {
        expect(await resolved("/pages/inline.html")).toBe(`${origin}/pages/data.json`);
        expect(await resolved("/pages/based.html")).toBe(`${origin}/assets/data.json`);
    });

    it("reads its address from the document itself where the page names an element currentScript or baseURI", { timeout: 60000 }, async () =>
    {
        expect(await resolved("/pages/named.html")).toBe(`${origin}/scripts/data.json`);
        expect(await resolved("/pages/named-inline.html")).toBe(`${origin}/pages/data.json`);
    });
});
