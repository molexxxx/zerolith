// Executed checks for the widget tutorial's files that run on Node: the
// example handler on Node's HTTP server, and the script that copies the
// built widget to a name that stays the same. Both run as the reader runs
// them, with `node <file>`.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const main = fileURLToPath(new URL("../fixtures/widget/app/server/main.ts", import.meta.url));
const embed = fileURLToPath(new URL("../fixtures/widget/app/scripts/embed.ts", import.meta.url));
const cleanups: Array<() => void> = [];

afterEach(() =>
{
    for (const clean of cleanups.splice(0))
    {
        clean();
    }
});

/** A port nothing listens on right now, found by binding one and letting it go. */
function freePort(): Promise<number>
{
    return new Promise((resolve, reject) =>
    {
        const server = createServer();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () =>
        {
            const address = server.address();
            server.close(() => resolve(typeof address === "object" && address !== null ? address.port : 0));
        });
    });
}

/** Starts `node server/main.ts` on `port` and resolves once it says where it listens, with its output so far. */
function startHandler(port: number): Promise<{ child: ChildProcess; output: () => string }>
{
    return new Promise((resolve, reject) =>
    {
        const child = spawn(process.execPath, [main], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
        cleanups.push(() => child.kill());
        let output = "";
        const read = (chunk: Buffer): void =>
        {
            output += chunk.toString();
            if (output.includes(`Feedback handler at http://127.0.0.1:${port}/feedback\n`))
            {
                resolve({ child, output: () => output });
            }
        };
        child.stdout?.on("data", read);
        child.stderr?.on("data", read);
        child.on("exit", (code) => reject(new Error(`the handler exited with ${String(code)}: ${output}`)));
    });
}

/** Sends `text` to the port as it is and resolves with everything the server wrote back. */
function exchange(port: number, text: string): Promise<string>
{
    return new Promise((resolve, reject) =>
    {
        const socket = connect(port, "127.0.0.1", () => socket.end(text));
        let answer = "";
        socket.on("data", (chunk: Buffer) =>
        {
            answer += chunk.toString();
        });
        socket.on("end", () => resolve(answer));
        socket.on("error", reject);
    });
}

/** A folder holding dist/assets with the files given, as zerolith build leaves it. */
function built(files: Record<string, string>): string
{
    const project = mkdtempSync(join(tmpdir(), "zl-widget-"));
    cleanups.push(() => rmSync(project, { recursive: true, force: true }));
    mkdirSync(join(project, "dist", "assets"), { recursive: true });
    for (const [name, text] of Object.entries(files))
    {
        writeFileSync(join(project, "dist", "assets", name), text);
    }
    return project;
}

describe("widget tutorial on Node", () =>
{
    it("serves the example handler, prints what it receives, and answers the preflight", { timeout: 20000 }, async () =>
    {
        const port = await freePort();
        const { output } = await startHandler(port);
        const origin = `http://127.0.0.1:${port}`;
        const created = await fetch(`${origin}/feedback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ helpful: true, page: "/install", comment: "Clear" }) });
        expect(created.status).toBe(201);
        expect(created.headers.get("access-control-allow-origin")).toBe("*");
        expect(await created.json()).toEqual({ id: expect.any(String) });
        await expect.poll(output).toContain("feedback {\"helpful\":true,\"page\":\"/install\",\"comment\":\"Clear\"}\n");
        const preflight = await fetch(`${origin}/feedback`, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:8000", "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get("access-control-allow-headers")).toBe("content-type");
        const invalid = await fetch(`${origin}/feedback`, { method: "POST", body: "{}" });
        expect(invalid.status).toBe(400);
        expect(invalid.headers.get("content-type")).toBe("application/problem+json");
        expect(await exchange(port, `TRACE /feedback HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`)).toMatch(/^HTTP\/1\.1 400 /);
        expect((await fetch(`${origin}/feedback`)).status).toBe(405);
    });

    it("copies the one script zerolith build wrote to dist/feedback-widget.js", () =>
    {
        const project = built({ "index-B2fh7kQe.js": "customElements.define(\"x-y\", class extends HTMLElement {});", "index-3d5cc4bf.css": "body{margin:0}" });
        const run = spawnSync(process.execPath, [embed], { cwd: project, encoding: "utf8" });
        expect(run.status).toBe(0);
        expect(readFileSync(join(project, "dist", "feedback-widget.js"), "utf8")).toBe("customElements.define(\"x-y\", class extends HTMLElement {});");
    });

    it("fails when the build wrote more than one script, since the widget would not be one file", () =>
    {
        const project = built({ "index-B2fh7kQe.js": "import \"./shared-Dx1.js\";", "shared-Dx1.js": "export {};" });
        const run = spawnSync(process.execPath, [embed], { cwd: project, encoding: "utf8" });
        expect(run.status).not.toBe(0);
        expect(run.stderr).toContain("dist/assets holds 2 scripts, not one");
    });
});
