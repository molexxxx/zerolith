import { createServer as createHttpServer } from "node:http";
import { type ChildProcess, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alive, freePort, gone, startServer } from "./helpers.ts";

/**
 * A proxy rule's `run` command: `zerolith dev` starts the backend it names
 * in the project folder and forwards to it, reports one that ends on its
 * own, and stops it with every process it started when the server stops.
 * The backend here is a Node script that records its process id and
 * answers one path.
 */

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const root = join(repository, "target", `backends-${process.pid}`);
const servers: ChildProcess[] = [];
let port = 0;
let backendPid: number | undefined;

/** The project's settings with one proxy rule for `/api`, with or without the command that starts the backend. */
function settings(run: string | undefined): string
{
    return JSON.stringify({ proxy: { "/api": { target: `http://127.0.0.1:${port}`, ...(run === undefined ? {} : { run }) } } }, null, 4);
}

/** Fetches a path until it answers 200, for up to 20 seconds, as the backend takes a moment to listen. */
async function answer(url: string): Promise<string>
{
    const deadline = Date.now() + 20000;
    let last = "";
    while (Date.now() < deadline)
    {
        const response = await fetch(url);
        last = await response.text();
        if (response.status === 200)
        {
            return last;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`${url} never answered 200; last: ${last}`);
}

/** Waits until the server's output holds `text`, for up to 20 seconds. */
async function printed(output: () => string, text: string): Promise<boolean>
{
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline)
    {
        if (output().includes(text))
        {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return output().includes(text);
}

/** Ends the backend outright and waits until it is gone, since it runs in the project folder: on Windows, Node ends the server outright too, which gives it no chance to stop its backend, while a Ctrl+C in a console reaches both. */
async function endBackend(pid: number): Promise<void>
{
    if (alive(pid))
    {
        if (process.platform === "win32")
        {
            spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
        }
        else
        {
            process.kill(pid, "SIGKILL");
        }
        await gone(pid);
    }
}

beforeAll(async () =>
{
    port = await freePort();
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "index.html"), "<!doctype html><title>backends</title><script type=\"module\" src=\"/main.js\"></script>");
    writeFileSync(join(root, "main.js"), "export {};\n");
    writeFileSync(join(root, "server.mjs"), [
        "import { createServer } from \"node:http\";",
        "import { writeFileSync } from \"node:fs\";",
        "const port = Number(process.argv[2]);",
        "createServer((request, response) => { response.setHeader(\"content-type\", \"text/plain\"); response.end(`pong ${request.url} ${process.cwd()}`); }).listen(port, \"127.0.0.1\", () => { writeFileSync(\"pid.txt\", String(process.pid)); });",
        ""
    ].join("\n"));
});

afterAll(async () =>
{
    for (const server of servers)
    {
        server.kill();
    }
    if (backendPid !== undefined)
    {
        await endBackend(backendPid);
    }
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

describe("a proxy rule's run command", () =>
{
    it("starts the backend with dev in the project folder, forwards to it, and stops it with the server", async () =>
    {
        writeFileSync(join(root, "zerolith.json"), settings(`node server.mjs ${port}`));
        const { origin, child, output } = await startServer(["dev", root]);
        servers.push(child);
        expect(output()).toContain(`node server.mjs ${port}`);
        const text = await answer(`${origin}/api/ping`);
        expect(text.startsWith("pong /api/ping ")).toBe(true);
        expect(text.trim().endsWith(root)).toBe(true);
        backendPid = Number(readFileSync(join(root, "pid.txt"), "utf8"));
        expect(alive(backendPid)).toBe(true);

        if (process.platform === "win32")
        {
            child.kill();
            await endBackend(backendPid);
            return;
        }
        child.kill("SIGTERM");
        expect(await gone(backendPid)).toBe(true);
    }, 60000);

    it("reports a backend that ends on its own", async () =>
    {
        writeFileSync(join(root, "zerolith.json"), settings("node -e \"process.exit(7)\""));
        const { origin, child, output } = await startServer(["dev", root]);
        servers.push(child);
        expect(await printed(output, "ended with")).toBe(true);
        expect(output()).toContain("its paths answer 502 until it runs again");
        const response = await fetch(`${origin}/api/ping`);
        expect(response.status).toBe(502);
        child.kill();
    }, 60000);

    it("leaves a backend that already answers as it is, and forwards to it", async () =>
    {
        const running = createHttpServer((_request, response) =>
        {
            response.end("from the one already running");
        });
        await new Promise<void>((resolve) => running.listen(port, "127.0.0.1", resolve));
        try
        {
            rmSync(join(root, "pid.txt"), { force: true });
            writeFileSync(join(root, "zerolith.json"), settings(`node server.mjs ${port}`));
            const { origin, child, output } = await startServer(["dev", root]);
            servers.push(child);
            expect(output()).toContain(`already answers`);
            expect(await answer(`${origin}/api/ping`)).toBe("from the one already running");
            expect(existsSync(join(root, "pid.txt")), "no second copy started").toBe(false);
            child.kill();
        }
        finally
        {
            await new Promise((resolve) => running.close(resolve));
        }
    });

    it("leaves the backend to the user with --no-backends", async () =>
    {
        writeFileSync(join(root, "zerolith.json"), settings(`node server.mjs ${port}`));
        const { origin, child, output } = await startServer(["dev", root, "--no-backends"]);
        servers.push(child);
        expect(output()).not.toContain("node server.mjs");
        const response = await fetch(`${origin}/api/ping`);
        expect(response.status).toBe(502);
        child.kill();
    }, 60000);
});
