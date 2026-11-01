import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import type { Project, Task } from "../shared/model.ts";
import { createApp } from "../server/app.ts";

type App = ReturnType<typeof createApp>;

const dist = mkdtempSync(join(tmpdir(), "harbor-dist-"));

afterAll(() =>
{
    rmSync(dist, { recursive: true, force: true });
});

/** A request to the backend, as the app on the same origin sends it. */
function request(path: string, init: RequestInit = {}): Request
{
    return new Request(new URL(path, "http://harbor.test"), init);
}

/** A form submission, as @zerolith/forms sends one. */
function form(path: string, cookie: string, fields: Record<string, string>): Request
{
    return request(path, { method: "POST", headers: { cookie }, body: new URLSearchParams(fields) });
}

/** Signs in as Ada and returns the session cookie to send back. */
async function signIn(app: App): Promise<string>
{
    const response = await app(form("/api/session", "", { email: "ada@harbor.test", password: "analytical" }));
    expect(response.status).toBe(200);
    return response.headers.getSetCookie()[0]?.split(";")[0] ?? "";
}

it("asks for a session, and signs in with the right password only", async () =>
{
    const app = createApp();
    expect((await app(request("/api/projects"))).status).toBe(401);
    const wrong = await app(form("/api/session", "", { email: "ada@harbor.test", password: "wrong" }));
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ fields: { password: ["That email and password do not match an account."] } });
    const cookie = await signIn(app);
    const session = await app(request("/api/session", { headers: { cookie } }));
    expect(await session.json()).toEqual({ user: { id: 1, name: "Ada Lovelace", email: "ada@harbor.test" } });
});

it("checks input with the shared schemas, then creates a project and a task and finishes it", async () =>
{
    const app = createApp();
    const cookie = await signIn(app);
    const invalid = await app(form("/api/projects", cookie, { name: "x", summary: "" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ fields: { name: ["Give the project a name of 2 to 60 characters."] } });
    const created = await app(form("/api/projects", cookie, { name: "Launch party", summary: "" }));
    expect(created.status).toBe(201);
    const project = (await created.json()) as Project;
    const added = await app(form(`/api/projects/${project.id}/tasks`, cookie, { title: "Order the banners", due: "" }));
    const task = (await added.json()) as Task;
    expect(task).toMatchObject({ title: "Order the banners", status: "todo", due: null });
    const finished = await app(request(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ status: "done" })
    }));
    expect(await finished.json()).toMatchObject({ status: "done" });
    const summary = await app(request("/api/summary", { headers: { cookie } }));
    expect(await summary.json()).toMatchObject({ projects: 4 });
});

it("streams each new activity to an open dashboard", async () =>
{
    const app = createApp();
    const cookie = await signIn(app);
    const close = new AbortController();
    const stream = await app(request("/api/events", { headers: { cookie }, signal: close.signal }));
    expect(stream.headers.get("content-type")).toBe("text/event-stream");
    const reader = stream.body?.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader?.read())?.value)).toBe(": connected\n\n");
    await app(form("/api/projects", cookie, { name: "Launch party", summary: "" }));
    expect(decoder.decode((await reader?.read())?.value)).toContain("created the project Launch party");
    close.abort();
});

// A stand-in for what npm run build writes, so the test needs no build first.
it("serves the build under /app/, with index.html for routes and the hashed files cached", async () =>
{
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>Harbor</title>");
    writeFileSync(join(dist, "assets", "index-1a2b3c4d.js"), "");
    const app = createApp({ dist });
    expect((await app(request("/"))).headers.get("location")).toBe("/app/");
    const route = await app(request("/app/projects/1"));
    expect(route.headers.get("cache-control")).toBe("no-cache");
    expect(await route.text()).toContain("<title>Harbor</title>");
    const asset = await app(request("/app/assets/index-1a2b3c4d.js"));
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect((await app(request("/app/assets/missing.js"))).status).toBe(404);
});
