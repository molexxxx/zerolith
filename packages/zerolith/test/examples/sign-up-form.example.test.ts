// Executed checks for the sign-up form tutorial that need Node: the backend
// run the way npm run api runs it, the proxy that forwards to it, and the
// files each step leaves as they are, read from disk.
import { type ChildProcess, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const fixtures = new URL("../fixtures/sign-up-form/", import.meta.url);
const running: ChildProcess[] = [];

afterEach(() =>
{
    for (const child of running.splice(0))
    {
        child.kill();
    }
});

function read(path: string): Promise<string>
{
    return readFile(new URL(path, fixtures), "utf8");
}

/** A port nothing listens on right now, chosen by the system. */
function freePort(): Promise<number>
{
    return new Promise((resolve, reject) =>
    {
        const probe = createServer();
        probe.on("error", reject);
        probe.listen(0, "127.0.0.1", () =>
        {
            const address = probe.address();
            probe.close(() => resolve(typeof address === "object" && address !== null ? address.port : 0));
        });
    });
}

/** What the backend has written to its error stream. */
let errors = "";

/** The status of a request `fetch` refuses to send, written with Node's own client. */
function statusOf(method: string, port: number): Promise<number | undefined>
{
    return new Promise((resolve, reject) =>
    {
        const outgoing = httpRequest({ host: "127.0.0.1", port, method, path: "/api/sign-ups" }, (incoming) =>
        {
            incoming.resume();
            incoming.on("end", () => resolve(incoming.statusCode));
        });
        outgoing.on("error", reject);
        outgoing.end();
    });
}

/** Starts the backend on `port`, as `node server/main.ts`, and resolves with the first line it prints. */
function start(port: number): Promise<string>
{
    errors = "";
    const main = fileURLToPath(new URL("app/server/main.ts", fixtures));
    const child = spawn(process.execPath, [main], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
    running.push(child);
    return new Promise((resolve, reject) =>
    {
        child.stderr.on("data", (chunk: Buffer) =>
        {
            errors += chunk.toString("utf8");
        });
        child.stdout.once("data", (chunk: Buffer) => resolve(chunk.toString("utf8")));
        child.once("exit", (code) => reject(new Error(`the backend exited with ${String(code)}: ${errors}`)));
    });
}

describe("sign-up form tutorial, run by Node", () =>
{
    it("serves the endpoint on the port it says, as the contract states", { timeout: 30000 }, async () =>
    {
        const port = await freePort();
        const printed = await start(port);
        expect(printed).toBe(`Sign-ups at http://127.0.0.1:${port}/api/sign-ups\n`);
        const url = `http://127.0.0.1:${port}/api/sign-ups`;
        const fields = { name: "Zoë Ångström", email: "zoe@example.com", password: "compilers-in-1952", plan: "plus", terms: "accepted" };
        const created = await fetch(url, { method: "POST", body: new URLSearchParams(fields) });
        expect(created.status).toBe(201);
        expect(created.headers.get("content-type")).toBe("application/json");
        expect(await created.json()).toEqual({ id: 2, name: "Zoë Ångström", email: "zoe@example.com", plan: "plus" });
        const taken = await fetch(url, { method: "POST", body: new URLSearchParams({ ...fields, email: "ada@example.com" }) });
        expect(taken.status).toBe(409);
        expect(taken.headers.get("content-type")).toBe("application/problem+json; charset=utf-8");
        expect(await taken.json()).toEqual({ type: "about:blank", title: "Conflict", status: 409, fields: { email: ["This email address already has an account."] } });
        const invalid = await fetch(url, { method: "POST", body: new URLSearchParams({ ...fields, email: "zoe" }) });
        expect(invalid.status).toBe(400);
        expect(await invalid.json()).toEqual({ type: "about:blank", title: "The submission has invalid fields", status: 400, fields: { email: ["Enter an email address like name@example.com."] } });
        const multipart = new FormData();
        for (const [name, value] of Object.entries({ ...fields, email: "zoe.multipart@example.com" }))
        {
            multipart.append(name, value);
        }
        const raw = await fetch(url, { method: "POST", body: multipart });
        expect((await raw.json() as { name: string }).name).toBe("Zoë Ångström");
        expect((await fetch(url)).status).toBe(404);
        const json = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        expect(json.status).toBe(415);
        expect(await statusOf("TRACE", port)).toBe(500);
        expect(errors).toContain("TRACE");
        expect((await fetch(url)).status).toBe(404);
    });

    it("listens by default on the port the proxy forwards /api to, and the proxy starts it", async () =>
    {
        const config = JSON.parse(await read("app/zerolith.json")) as { proxy: Record<string, unknown> };
        expect(config.proxy).toEqual({ "/api": { target: "http://127.0.0.1:3000", run: "npm run api" } });
        expect(await read("app/server/main.ts")).toContain("process.env[\"PORT\"] ?? \"3000\"");
    });

    it("leaves as they are the files a step does not show again", async () =>
    {
        const unchanged: Record<string, string[]> = {
            form: ["components/sign-up.css"],
            rules: ["schema.ts", "components/sign-up.css", "components/message.ts", "components/plan-choice.ts", "components/checkbox.ts"],
            typing: ["schema.ts", "components/sign-up.css", "components/message.ts", "components/plan-choice.ts", "components/checkbox.ts", "components/password-rules.ts", "components/text-field.ts"],
            sending: ["schema.ts", "components/sign-up.css", "components/message.ts", "components/plan-choice.ts", "components/checkbox.ts", "components/password-rules.ts", "components/text-field.ts"]
        };
        for (const [step, paths] of Object.entries(unchanged))
        {
            for (const path of paths)
            {
                expect(await read(`${step}/src/${path}`), `${step}/src/${path}`).toBe(await read(`app/src/${path}`));
            }
        }
    });
});
