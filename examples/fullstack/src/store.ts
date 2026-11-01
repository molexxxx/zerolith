// The state more than one page reads: the typed API client, the session, and
// the data the dashboard and the project list share. Pages read these
// signals; after a change, `refresh` makes every resource here load again.
// A 401 while signed in means the backend forgot the session, as a restart
// does, so the session loads again and the sign-in page comes back.
import { ProblemError, createClient } from "@zerolith/client";
import type { LoadContext } from "@zerolith/router";
import { type Problem, computed, resource, signal, untracked } from "zerolith";
import { type Api, routes } from "../shared/api.ts";
import type { ProjectDetail, Session } from "../shared/model.ts";

/** Sends a call with fetch, and asks for the session again when the backend no longer knows it; the session's own request is where that answer is read. */
async function send(request: Request): Promise<Response>
{
    const response = await fetch(request);
    if (response.status === 401 && !new URL(request.url).pathname.endsWith("/api/session"))
    {
        expired({ status: 401 });
    }
    return response;
}

/** The API, typed by the contract in shared/api.ts that the backend answers. */
export const api = createClient<Api>(routes, { transport: send });

const sessions = signal(0, { name: "sessions" });
const changes = signal(0, { name: "changes" });

/** How long the page waits before asking an unreachable backend for the session again, in milliseconds. */
const RETRY_DELAY = 2000;

/** The pending retry while the backend is out of reach, so failures in a row schedule one. */
let retry: ReturnType<typeof setTimeout> | undefined;

/** True while the backend cannot be reached for the session, as before `npm run api` has started; the session is asked for again every two seconds meanwhile, so the page opens once the backend answers. */
export const unreachable = signal(false, { name: "unreachable" });

/** The session: undefined while it loads, null when nobody is signed in. */
export const session = resource({
    params: () => sessions.get(),
    loader: async ({ abort }): Promise<Session | null> =>
    {
        try
        {
            const value = await api.call("getSession", {}, { signal: abort });
            unreachable.set(false);
            return value;
        }
        catch (error)
        {
            if (error instanceof ProblemError && error.problem.status === 401)
            {
                unreachable.set(false);
                return null;
            }
            if (!abort.aborted)
            {
                unreachable.set(true);
                retry ??= setTimeout(() =>
                {
                    retry = undefined;
                    reloadSession();
                }, RETRY_DELAY);
            }
            throw error;
        }
    }
});

/** The member who is signed in, or undefined. */
export const user = computed(() => session.get()?.user);

/** True once the backend has said that nobody is signed in. */
export const signedOut = computed(() => session.get() === null);

/** What the shared resources load for: nothing while signed out, so they wait idle. */
function signedInChanges(): number | undefined
{
    return user.get() === undefined ? undefined : changes.get();
}

/** The dashboard's numbers. */
export const summary = resource({
    params: signedInChanges,
    loader: ({ abort }) => api.call("getSummary", {}, { signal: abort })
});

/** Every project, with its counts. */
export const projects = resource({
    params: signedInChanges,
    loader: ({ abort }) => api.call("listProjects", {}, { signal: abort })
});

/** Loads the shared data again, after any change. */
export function refresh(): void
{
    changes.set(changes.get() + 1);
}

/** Asks the backend for the session again, after signing in or out. */
export function reloadSession(): void
{
    sessions.set(sessions.get() + 1);
}

/** Handles a failure's problem: a 401 while someone is signed in loads the session again. Forms pass it as `onFailure`, since they send with fetch themselves. */
export function expired(problem: Problem): void
{
    if (problem.status === 401 && untracked(() => user.get()) !== undefined)
    {
        reloadSession();
    }
}

export async function signOut(): Promise<void>
{
    await api.call("signOut");
    reloadSession();
}

/** The project page's loader: the project and its tasks, or undefined when there is no such project. */
export async function loadProject({ params, abort }: LoadContext<{ id: string }>): Promise<ProjectDetail | undefined>
{
    try
    {
        return await api.call("getProject", { params: { id: Number(params.id) } }, { signal: abort });
    }
    catch (error)
    {
        if (error instanceof ProblemError && error.problem.status === 404)
        {
            return undefined;
        }
        throw error;
    }
}
