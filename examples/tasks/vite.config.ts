// The example's Vite configuration: the zerolith plugin for hot replacement,
// and a development API the typed client and the form talk to, so the
// example runs with `vite` alone. The API keeps tasks in memory and
// validates with the same schema the form uses.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type Plugin, defineConfig } from "vite";
import { problemResponse, validateForm } from "@zerolith/forms";
import { zerolith } from "@zerolith/vite";
import { taskSchema } from "./src/schema.ts";

interface Task
{
    id: string;
    title: string;
    done: boolean;
    createdAt: string;
}

function seed(): Task[]
{
    return [
        { id: "1", title: "Read the routing guide", done: false, createdAt: "2026-10-27T09:00:00.000Z" },
        { id: "2", title: "Ship the first release", done: false, createdAt: "2026-10-28T09:00:00.000Z" },
        { id: "3", title: "Set up the repository", done: true, createdAt: "2026-10-26T09:00:00.000Z" }
    ];
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>>
{
    const chunks: Buffer[] = [];
    for await (const chunk of request)
    {
        chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (text === "")
    {
        return {};
    }
    const type = request.headers["content-type"] ?? "";
    if (type.includes("json"))
    {
        return JSON.parse(text) as Record<string, unknown>;
    }
    return Object.fromEntries(new URLSearchParams(text));
}

async function send(response: ServerResponse, answer: Response): Promise<void>
{
    response.statusCode = answer.status;
    answer.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(await answer.text());
}

/** The in-memory task API under /api, as a Connect middleware. */
function api(): Plugin
{
    let tasks = seed();
    const handle = async (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void): Promise<void> =>
            {
                const url = new URL(request.url ?? "/", "http://localhost");
                const match = /^\/api\/tasks(?:\/([^/]+))?$/.exec(url.pathname);
                if (match === null)
                {
                    next();
                    return;
                }
                const id = match[1];
                const method = request.method ?? "GET";
                if (id === undefined && method === "GET")
                {
                    await send(response, Response.json(tasks.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))));
                }
                else if (id === undefined && method === "POST")
                {
                    const validation = await validateForm(taskSchema, await body(request));
                    if (validation.problem !== undefined)
                    {
                        await send(response, problemResponse(validation.problem));
                        return;
                    }
                    const task: Task = { id: randomUUID(), title: validation.value.title, done: false, createdAt: new Date().toISOString() };
                    tasks = [...tasks, task];
                    await send(response, Response.json(task, { status: 201 }));
                }
                else if (id === "reset" && method === "POST")
                {
                    tasks = seed();
                    await send(response, new Response(null, { status: 204 }));
                }
                else
                {
                    const task = tasks.find((candidate) => candidate.id === id);
                    if (task === undefined)
                    {
                        await send(response, problemResponse({ title: "No such task", status: 404 }));
                    }
                    else if (method === "GET")
                    {
                        await send(response, Response.json(task));
                    }
                    else if (method === "PATCH")
                    {
                        const changes = await body(request);
                        task.done = changes["done"] === true || changes["done"] === "true";
                        await send(response, Response.json(task));
                    }
                    else if (method === "DELETE")
                    {
                        tasks = tasks.filter((candidate) => candidate !== task);
                        await send(response, new Response(null, { status: 204 }));
                    }
                    else
                    {
                        await send(response, problemResponse({ title: "Method not allowed", status: 405 }));
                    }
                }
    };
    return {
        name: "tasks-api",
        configureServer(server)
        {
            server.middlewares.use((request, response, next) =>
            {
                handle(request, response, next).catch((error: unknown) => next(error));
            });
        }
    };
}

export default defineConfig({
    plugins: [zerolith(), api()],
    server: { port: 5173, strictPort: false }
});
