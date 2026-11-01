// The state more than one page reads: the typed API client, the session, and
// the data the dashboard and the project list share. Pages read these
// signals; after a change, `refresh` makes every resource here load again.
import { ProblemError, createClient } from "@zerolith/client";
import type { LoadContext } from "@zerolith/router";
import { computed, resource, signal } from "zerolith";
import { type Api, routes } from "../shared/api.ts";
import type { ProjectDetail, Session } from "../shared/model.ts";

/** The API, typed by the contract in shared/api.ts that the backend answers. */
export const api = createClient<Api>(routes);

const sessions = signal(0, { name: "sessions" });
const changes = signal(0, { name: "changes" });

/** The session: undefined while it loads, null when nobody is signed in. */
export const session = resource({
    params: () => sessions.get(),
    loader: async ({ abort }): Promise<Session | null> =>
    {
        try
        {
            return await api.call("getSession", {}, { signal: abort });
        }
        catch (error)
        {
            if (error instanceof ProblemError && error.problem.status === 401)
            {
                return null;
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

export async function signOut(): Promise<void>
{
    await api.call("signOut");
    reloadSession();
}

/** The project page's loader: the project and its tasks, or undefined when there is no such project or nobody is signed in. */
export async function loadProject({ params, abort }: LoadContext<{ id: string }>): Promise<ProjectDetail | undefined>
{
    try
    {
        return await api.call("getProject", { params: { id: Number(params.id) } }, { signal: abort });
    }
    catch (error)
    {
        if (error instanceof ProblemError)
        {
            return undefined;
        }
        throw error;
    }
}
