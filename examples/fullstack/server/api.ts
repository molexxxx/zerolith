// The API: every route of shared/api.ts, answered from a Request with a
// Response. Each route but signing in needs the session cookie, input is
// checked with the schemas the app's forms run, and a failure is a problem
// document whose fields the forms show next to their inputs.
import { type StandardSchema, problemResponse, validateForm } from "@zerolith/forms";
import type { TaskStatus, User } from "../shared/model.ts";
import { newProjectSchema, newTaskSchema, signInSchema, taskChangeSchema } from "../shared/schema.ts";
import { type Data, projectOf, record, summaryOf, taskOf } from "./data.ts";
import type { Events } from "./events.ts";

const COOKIE = "harbor_session";

const MOVED: Record<TaskStatus, string> = { todo: "moved back to To do", doing: "started", done: "finished" };

/** What a route's handler receives. */
interface Context
{
    request: Request;
    user: User;
    session: string;
    id: number;
}

type Route = [method: string, path: RegExp, handle: (context: Context) => Response | Promise<Response>];

/** The request's body, from JSON or from a submitted form. */
async function body(request: Request): Promise<FormData | Record<string, unknown>>
{
    if ((request.headers.get("content-type") ?? "").includes("json"))
    {
        const parsed: unknown = await request.json().catch(() => undefined);
        return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
    }
    return request.formData().catch(() => new FormData());
}

/** The request's body checked by `schema`: the parsed value, or the problem to answer with. */
async function check<T>(request: Request, schema: StandardSchema<unknown, T>): Promise<T | Response>
{
    const validation = await validateForm(schema, await body(request));
    return validation.problem === undefined ? validation.value : problemResponse(validation.problem);
}

/** The session id the request's cookie carries. */
function sessionOf(request: Request): string | undefined
{
    for (const part of (request.headers.get("cookie") ?? "").split(";"))
    {
        const [name, value] = part.trim().split("=");
        if (name === COOKIE && value !== undefined && value !== "")
        {
            return value;
        }
    }
    return undefined;
}

/** The session cookie: readable by the server only, and `Secure` over HTTPS. */
function cookie(request: Request, value: string, maxAge?: number): string
{
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax${maxAge === undefined ? "" : `; Max-Age=${maxAge}`}${secure}`;
}

function missing(title: string): Response
{
    return problemResponse({ status: 404, title });
}

/** A member as the API shows them, without the password. */
function profile(user: User): User
{
    return { id: user.id, name: user.name, email: user.email };
}

/** The API over `data`, announcing every change through `events`. */
export function createApi(data: Data, events: Events): (request: Request) => Promise<Response>
{
    const announce = (user: User, text: string): void => events.send(record(data, user.name, text));
    const routes: Route[] = [
        ["GET", /^\/api\/session$/, ({ user }) => Response.json({ user: profile(user) })],
        ["DELETE", /^\/api\/session$/, ({ request, session }) =>
        {
            data.sessions.delete(session);
            return new Response(null, { status: 204, headers: { "set-cookie": cookie(request, "", 0) } });
        }],
        ["GET", /^\/api\/summary$/, () => Response.json(summaryOf(data))],
        ["GET", /^\/api\/activity$/, () => Response.json(data.activity.slice(-20).toReversed())],
        ["GET", /^\/api\/events$/, ({ request }) => events.stream(request.signal)],
        ["GET", /^\/api\/projects$/, () => Response.json(data.projects.map((project) => projectOf(data, project)))],
        ["POST", /^\/api\/projects$/, async ({ request, user }) =>
        {
            const input = await check(request, newProjectSchema);
            if (input instanceof Response)
            {
                return input;
            }
            data.ids.project += 1;
            const project = { id: data.ids.project, ...input };
            data.projects.push(project);
            announce(user, `created the project ${project.name}`);
            return Response.json(projectOf(data, project), { status: 201 });
        }],
        ["GET", /^\/api\/projects\/(\d+)$/, ({ id }) =>
        {
            const project = data.projects.find((candidate) => candidate.id === id);
            if (project === undefined)
            {
                return missing("No such project");
            }
            const tasks = data.tasks.filter((task) => task.projectId === id).map(taskOf);
            return Response.json({ project: projectOf(data, project), tasks });
        }],
        ["POST", /^\/api\/projects\/(\d+)\/tasks$/, async ({ request, user, id }) =>
        {
            const project = data.projects.find((candidate) => candidate.id === id);
            if (project === undefined)
            {
                return missing("No such project");
            }
            const input = await check(request, newTaskSchema);
            if (input instanceof Response)
            {
                return input;
            }
            data.ids.task += 1;
            const task = { id: data.ids.task, projectId: id, title: input.title, status: "todo" as const, due: input.due, doneAt: null };
            data.tasks.push(task);
            announce(user, `added ${task.title} to ${project.name}`);
            return Response.json(taskOf(task), { status: 201 });
        }],
        ["PATCH", /^\/api\/tasks\/(\d+)$/, async ({ request, user, id }) =>
        {
            const task = data.tasks.find((candidate) => candidate.id === id);
            if (task === undefined)
            {
                return missing("No such task");
            }
            const input = await check(request, taskChangeSchema);
            if (input instanceof Response)
            {
                return input;
            }
            task.status = input.status;
            task.doneAt = input.status === "done" ? new Date().toISOString() : null;
            announce(user, `${MOVED[input.status]} ${task.title}`);
            return Response.json(taskOf(task));
        }],
        ["DELETE", /^\/api\/tasks\/(\d+)$/, ({ user, id }) =>
        {
            const task = data.tasks.find((candidate) => candidate.id === id);
            if (task === undefined)
            {
                return missing("No such task");
            }
            data.tasks = data.tasks.filter((candidate) => candidate !== task);
            announce(user, `deleted ${task.title}`);
            return new Response(null, { status: 204 });
        }]
    ];

    const signIn = async (request: Request): Promise<Response> =>
    {
        const input = await check(request, signInSchema);
        if (input instanceof Response)
        {
            return input;
        }
        const user = data.users.find((candidate) => candidate.email === input.email && candidate.password === input.password);
        if (user === undefined)
        {
            return problemResponse({ status: 400, title: "The email or the password is wrong", fields: { password: ["That email and password do not match an account."] } });
        }
        const session = crypto.randomUUID();
        data.sessions.set(session, user.id);
        return Response.json({ user: profile(user) }, { headers: { "set-cookie": cookie(request, session) } });
    };

    return async (request) =>
    {
        const { pathname } = new URL(request.url);
        if (request.method === "POST" && pathname === "/api/session")
        {
            return signIn(request);
        }
        const session = sessionOf(request);
        const userId = session === undefined ? undefined : data.sessions.get(session);
        const user = data.users.find((candidate) => candidate.id === userId);
        if (session === undefined || user === undefined)
        {
            return problemResponse({ status: 401, title: "Sign in to continue" });
        }
        for (const [method, path, handle] of routes)
        {
            const matched = path.exec(pathname);
            if (matched !== null && method === request.method)
            {
                return handle({ request, user, session, id: Number(matched[1] ?? "0") });
            }
        }
        return missing("No such route");
    };
}
