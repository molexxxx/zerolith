// The example's task API as a fetch handler: tasks kept in memory and
// validated with the schema the form uses. The Vite configuration mounts it
// on the dev server, and the test of the bundled build serves it next to the
// output, the way any backend would sit next to the built files.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { problemResponse, validateForm } from "@zerolith/forms";
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

async function fields(request: Request): Promise<Record<string, unknown>>
{
    const text = await request.text();
    if (text === "")
    {
        return {};
    }
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("json"))
    {
        return JSON.parse(text) as Record<string, unknown>;
    }
    return Object.fromEntries(new URLSearchParams(text));
}

/** Creates the API with its seed tasks; the handler answers requests under `/api/tasks` and returns `undefined` for any other path. */
export function createTaskApi(): (request: Request) => Promise<Response | undefined>
{
    let tasks = seed();
    return async (request) =>
    {
        const match = /^\/api\/tasks(?:\/([^/]+))?$/.exec(new URL(request.url).pathname);
        if (match === null)
        {
            return undefined;
        }
        const id = match[1];
        const method = request.method;
        if (id === undefined && method === "GET")
        {
            return Response.json(tasks.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)));
        }
        if (id === undefined && method === "POST")
        {
            const validation = await validateForm(taskSchema, await fields(request));
            if (validation.problem !== undefined)
            {
                return problemResponse(validation.problem);
            }
            const task: Task = { id: randomUUID(), title: validation.value.title, done: false, createdAt: new Date().toISOString() };
            tasks = [...tasks, task];
            return Response.json(task, { status: 201 });
        }
        if (id === "reset" && method === "POST")
        {
            tasks = seed();
            return new Response(null, { status: 204 });
        }
        const task = tasks.find((candidate) => candidate.id === id);
        if (task === undefined)
        {
            return problemResponse({ title: "No such task", status: 404 });
        }
        if (method === "GET")
        {
            return Response.json(task);
        }
        if (method === "PATCH")
        {
            const changes = await fields(request);
            task.done = changes["done"] === true || changes["done"] === "true";
            return Response.json(task);
        }
        if (method === "DELETE")
        {
            tasks = tasks.filter((candidate) => candidate !== task);
            return new Response(null, { status: 204 });
        }
        return problemResponse({ title: "Method not allowed", status: 405 });
    };
}

/** Answers a Node request through the API when its path is under `/api/tasks`, and returns false without reading it otherwise, so the next handler can. */
export async function answer(api: (request: Request) => Promise<Response | undefined>, request: IncomingMessage, response: ServerResponse): Promise<boolean>
{
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/tasks" && !url.pathname.startsWith("/api/tasks/"))
    {
        return false;
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers))
    {
        if (value !== undefined)
        {
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
    }
    const method = request.method ?? "GET";
    const init: RequestInit = { method, headers };
    if (method !== "GET" && method !== "HEAD")
    {
        const chunks: Buffer[] = [];
        for await (const chunk of request)
        {
            chunks.push(chunk as Buffer);
        }
        init.body = Buffer.concat(chunks);
    }
    const result = await api(new Request(url, init));
    if (result === undefined)
    {
        return false;
    }
    response.statusCode = result.status;
    result.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(Buffer.from(await result.arrayBuffer()));
    return true;
}
