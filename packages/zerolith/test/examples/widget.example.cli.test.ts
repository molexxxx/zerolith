// Executed checks for the widget tutorial's build and embed steps, which need
// the command line: `zerolith build --entry` over the finished project, and
// the plain page that embeds the script it writes, served by a server that is
// not zerolith's and posting to the example handler on another origin.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { type Server, createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zerolithBinary } from "../../../../scripts/zerolith.ts";

const fixtures = new URL("../fixtures/widget/", import.meta.url);
const root = fileURLToPath(new URL("app/", fixtures));
const main = fileURLToPath(new URL("app/server/main.ts", fixtures));
const sitePage = readFileSync(new URL("embed/site/index.html", fixtures), "utf8");

let project: string;
let script: string;
let browser: Browser;
let handler: ChildProcess;
let handlerOutput = "";
let handlerOrigin: string;
let site: Server;
let siteOrigin: string;
let cdn: Server;

/** What a test server answers for one path. */
interface Answer
{
    type: string;
    body: string;
    headers?: Record<string, string>;
}

/** Answers on a free port with `answer`, and resolves with the server and its origin. */
async function serve(answer: (path: string) => Answer | undefined): Promise<{ server: Server; origin: string }>
{
    const server = createServer((request, response) =>
    {
        const found = answer(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
        if (found === undefined)
        {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { "content-type": found.type, ...found.headers }).end(found.body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    return { server, origin: `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}` };
}

/** The plain page, with its api at the handler's port for this run and its script at `src`. */
function page(src: string): string
{
    return sitePage.replace("http://127.0.0.1:3000", handlerOrigin).replace("src=\"feedback-widget.js\"", `src="${src}"`);
}

beforeAll(async () =>
{
    const binary = zerolithBinary();
    if (binary === undefined)
    {
        throw new Error("No zerolith binary: run cargo build, or set ZEROLITH_BINARY_PATH");
    }
    project = mkdtempSync(join(tmpdir(), "zl-widget-"));
    const built = spawnSync(binary, ["build", root, "--entry", "src/main.ts", "--name", "feedback-widget", "--out", join(project, "dist"), "--empty-out-dir"], { encoding: "utf8" });
    if (built.status !== 0)
    {
        throw new Error(`zerolith build failed: ${built.stderr}`);
    }
    script = readFileSync(join(project, "dist", "feedback-widget.js"), "utf8");
    const listening = await serve(() => undefined);
    await new Promise((resolve) => listening.server.close(resolve));
    handlerOrigin = listening.origin;
    handler = spawn(process.execPath, [main], { env: { ...process.env, PORT: new URL(handlerOrigin).port }, stdio: ["ignore", "pipe", "pipe"] });
    await new Promise<void>((resolve, reject) =>
    {
        const read = (chunk: Buffer): void =>
        {
            handlerOutput += chunk.toString();
            if (handlerOutput.includes("Feedback handler at"))
            {
                resolve();
            }
        };
        handler.stdout?.on("data", read);
        handler.stderr?.on("data", read);
        handler.on("exit", (code) => reject(new Error(`the handler exited with ${String(code)}: ${handlerOutput}`)));
    });
    const hosting = await serve((path) =>
    {
        if (path === "/plain/feedback-widget.js")
        {
            return { type: "text/javascript", body: script };
        }
        return path === "/cors/feedback-widget.js" ? { type: "text/javascript", body: script, headers: { "access-control-allow-origin": "*" } } : undefined;
    });
    cdn = hosting.server;
    const started = await serve((path) =>
    {
        const pages: Record<string, string> = {
            "/": page("feedback-widget.js"),
            "/plain.html": page(`${hosting.origin}/plain/feedback-widget.js`),
            "/cors.html": page(`${hosting.origin}/cors/feedback-widget.js`),
            "/fallback.html": page("feedback-widget.js").replace("</feedback-widget>", "Tell us what you think</feedback-widget>"),
            "/shadow.html": page("feedback-widget.js").replace(/<feedback-widget[\s\S]*?<\/feedback-widget>/, "<div id=\"outer\"></div>").replace("</body>", `<script>const made = document.createElement("feedback-widget"); made.setAttribute("api", "${handlerOrigin}"); document.querySelector("#outer").attachShadow({ mode: "open" }).append(made);</script></body>`)
        };
        if (path === "/feedback-widget.js")
        {
            return { type: "text/javascript", body: script };
        }
        if (path === "/strict.html")
        {
            const body = `<!doctype html><html lang="en"><title>Strict</title><script type="module" src="feedback-widget.js"></script><feedback-widget api="${handlerOrigin}"></feedback-widget></html>`;
            return { type: "text/html", body, headers: { "content-security-policy": `default-src 'self'; connect-src ${handlerOrigin}` } };
        }
        const body = pages[path];
        return body === undefined ? undefined : { type: "text/html", body };
    });
    site = started.server;
    siteOrigin = started.origin;
    browser = await chromium.launch();
}, 120000);

afterAll(async () =>
{
    await browser?.close();
    await new Promise((resolve) => site?.close(resolve));
    await new Promise((resolve) => cdn?.close(resolve));
    handler?.removeAllListeners("exit");
    handler?.kill();
    rmSync(project, { recursive: true, force: true });
});

describe("widget tutorial's build", () =>
{
    it("writes one file that holds the widget and imports nothing, under the name the tutorial gives it", () =>
    {
        expect(readdirSync(join(project, "dist"))).toEqual(["feedback-widget.js"]);
        expect(script).not.toMatch(/(?:^|[;}\s])(?:import\s*["'{*(]|export\s*[{*])/);
        expect(script).toContain("--feedback-border");
        expect(script).not.toContain("feedback-sent\",event");
    });
});

describe("widget tutorial's plain page", () =>
{
    it("loads the script, takes the page's look, posts across origins, and reports back", { timeout: 60000 }, async () =>
    {
        const tab = await browser.newPage();
        const logged: string[] = [];
        tab.on("console", (message) => logged.push(message.text()));
        await tab.goto(siteOrigin);
        expect(await tab.locator("legend").textContent()).toBe("Were these notes useful?");
        const send = tab.getByRole("button", { name: "Send" });
        expect(await send.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(15, 118, 110)");
        expect(await send.evaluate((element) => getComputedStyle(element).fontFamily)).toBe("system-ui, sans-serif");
        await tab.getByLabel("Comment, if you like").fill("From a plain page");
        await tab.getByLabel("Yes", { exact: true }).check();
        await send.click();
        await tab.locator("[role=status]", { hasText: "Thanks for your feedback." }).waitFor({ timeout: 10000 });
        await expect.poll(() => handlerOutput).toContain(`feedback {"helpful":true,"page":"${siteOrigin}/","comment":"From a plain page"}`);
        await expect.poll(() => logged.some((text) => text.startsWith("feedback-sent") && text.includes("From a plain page"))).toBe(true);
        await tab.close();
    });

    it("works from the keyboard alone and moves focus to the result", { timeout: 60000 }, async () =>
    {
        const tab = await browser.newPage();
        await tab.goto(siteOrigin);
        await tab.keyboard.press("Tab");
        expect(await tab.evaluate(() => document.activeElement?.getAttribute("value"))).toBe("yes");
        await tab.keyboard.press("ArrowDown");
        expect(await tab.getByLabel("No", { exact: true }).isChecked()).toBe(true);
        await tab.keyboard.press("Tab");
        await tab.keyboard.type("Typed");
        await tab.keyboard.press("Tab");
        expect(await tab.evaluate(() => document.activeElement?.textContent)).toBe("Send");
        await tab.keyboard.press("Enter");
        await tab.locator("[role=status]", { hasText: "Thanks for your feedback." }).waitFor({ timeout: 10000 });
        expect(await tab.evaluate(() => document.activeElement?.getAttribute("role"))).toBe("status");
        await expect.poll(() => handlerOutput).toContain("\"helpful\":false,");
        await tab.close();
    });

    it("works under a strict Content-Security-Policy that names the api", { timeout: 60000 }, async () =>
    {
        const tab = await browser.newPage();
        await tab.goto(`${siteOrigin}/strict.html`);
        const send = tab.getByRole("button", { name: "Send" });
        expect(await send.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(31, 95, 209)");
        await tab.getByLabel("Yes", { exact: true }).check();
        await send.click();
        await tab.locator("[role=status]", { hasText: "Thanks for your feedback." }).waitFor({ timeout: 10000 });
        await tab.close();
    });

    it("replaces the text inside the element once the script runs", { timeout: 60000 }, async () =>
    {
        const tab = await browser.newPage();
        await tab.goto(`${siteOrigin}/fallback.html`);
        await tab.locator("feedback-widget form").waitFor();
        expect(await tab.locator("feedback-widget").textContent()).not.toContain("Tell us what you think");
        await tab.close();
    });

    it("keeps its styles inside a shadow root of the page's", { timeout: 60000 }, async () =>
    {
        const tab = await browser.newPage();
        const logged: string[] = [];
        tab.on("console", (message) => logged.push(message.text()));
        await tab.goto(`${siteOrigin}/shadow.html`);
        const send = tab.getByRole("button", { name: "Send" });
        expect(await send.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(31, 95, 209)");
        await tab.getByLabel("Yes", { exact: true }).check();
        await send.click();
        await tab.locator("[role=status]", { hasText: "Thanks for your feedback." }).waitFor({ timeout: 10000 });
        await expect.poll(() => logged.some((text) => text.startsWith("feedback-sent"))).toBe(true);
        await tab.close();
    });

    it("loads the script from another origin only when its server allows it", { timeout: 60000 }, async () =>
    {
        const tab = await browser.newPage();
        const load = async (path: string): Promise<number> =>
        {
            await tab.goto(`${siteOrigin}${path}`, { waitUntil: "load" });
            return tab.locator("feedback-widget form").count();
        };
        expect(await load("/plain.html")).toBe(0);
        expect(await load("/cors.html")).toBe(1);
        await tab.close();
    });
});
