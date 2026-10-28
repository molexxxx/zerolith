import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Serves the built runtime unbundled behind a strict Content Security Policy
 * with Trusted Types enforced, loads it through an import map, and drives a
 * small app in headless Chromium. This is the buildless exit test: the same
 * files that ship to npm must run with no eval, no inline script, and the
 * zerolith Trusted Types policy as the only one allowed.
 */

const dist = fileURLToPath(new URL("../dist/", import.meta.url));

const importMap = "{\"imports\":{\"zerolith\":\"/zerolith/index.js\"}}";
const importMapHash = createHash("sha256").update(importMap).digest("base64");

const page = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>csp</title>
<script type="importmap">${importMap}</script>
<script type="module" src="/app.js"></script>
</head>
<body><main id="app"></main></body>
</html>`;

const app = `import { computed, each, html, render, signal, when } from "zerolith";
const count = signal(0);
const items = signal([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
function App()
{
    return html\`
        <h1 id="count">Count: \${count}</h1>
        <button id="inc" @click=\${() => count.set(count.get() + 1)}>+</button>
        <ul>\${each(items, (item) => item.id, (item) => html\`<li>\${computed(() => item.get().name)}</li>\`)}</ul>
        \${when(computed(() => count.get() > 1), () => html\`<p id="many">many</p>\`)}\`;
}
render(App(), document.getElementById("app"));
globalThis.__app = { count, items };
`;

const csp = [
    "default-src 'none'",
    `script-src 'self' 'sha256-${importMapHash}'`,
    "require-trusted-types-for 'script'",
    "trusted-types zerolith",
    "base-uri 'none'"
].join("; ");

let server: Server;
let origin: string;
let browser: Browser;

beforeAll(async () =>
{
    server = createServer(async (request, response) =>
    {
        const url = request.url ?? "/";
        if (url === "/")
        {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": csp });
            response.end(page);
            return;
        }
        if (url === "/app.js")
        {
            response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
            response.end(app);
            return;
        }
        if (url.startsWith("/zerolith/") && url.endsWith(".js") && !url.includes(".."))
        {
            try
            {
                const body = await readFile(dist + url.slice("/zerolith/".length));
                response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
                response.end(body);
                return;
            }
            catch
            {
                response.writeHead(404);
                response.end();
                return;
            }
        }
        response.writeHead(404);
        response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    browser = await chromium.launch();
});

afterAll(async () =>
{
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
});

describe("buildless under a strict CSP", () =>
{
    it("runs the published modules from an import map with Trusted Types enforced", async () =>
    {
        const tab = await browser.newPage();
        const errors: string[] = [];
        tab.on("console", (message) =>
        {
            if (message.type() === "error")
            {
                errors.push(message.text());
            }
        });
        tab.on("pageerror", (error) => errors.push(error.message));
        await tab.addInitScript(() =>
        {
            const violations: string[] = [];
            (globalThis as { cspViolations?: string[] }).cspViolations = violations;
            document.addEventListener("securitypolicyviolation", (event) =>
            {
                violations.push(`${event.violatedDirective} ${event.blockedURI} ${event.sample}`);
            });
        });
        await tab.goto(origin + "/");
        await tab.waitForSelector("#inc");

        const enforced = await tab.evaluate(() =>
        {
            try
            {
                document.createElement("div").innerHTML = "<b>x</b>";
                return false;
            }
            catch
            {
                return true;
            }
        });
        expect(enforced).toBe(true);

        await tab.click("#inc");
        await tab.click("#inc");
        expect(await tab.textContent("#count")).toBe("Count: 2");
        expect(await tab.textContent("#many")).toBe("many");
        expect(await tab.evaluate(() => Array.from(document.querySelectorAll("li")).map((li) => li.textContent))).toEqual(["a", "b"]);

        const violations = await tab.evaluate(() => (globalThis as { cspViolations?: string[] }).cspViolations) ?? [];
        const probe = violations.filter((violation) => violation.includes("Element innerHTML|<b>x</b>"));
        expect(probe).toHaveLength(1);
        expect(violations.filter((violation) => !probe.includes(violation))).toEqual([]);
        const probeLogs = errors.filter((error) => error.includes("requires 'TrustedHTML' assignment"));
        expect(probeLogs).toHaveLength(1);
        expect(errors.filter((error) => !probeLogs.includes(error))).toEqual([]);
        await tab.close();
    });
});
