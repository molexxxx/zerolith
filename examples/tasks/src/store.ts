// Data through the typed client: the list is a resource over the API, and
// the operations that change it reload the list when they succeed.
import { computed, signal } from "zerolith";
import { ProblemError, createClient } from "@zerolith/client";
import { type Api, type Task, routes } from "./api.ts";

export type { Task } from "./api.ts";

export const api = createClient<Api>(routes, { baseUrl: "" });

export const query = signal("");

/** Every task, newest first, as the API returns it. */
export const tasks = api.query("listTasks", () => ({}));

/** The tasks matching the search text. */
export const filtered = computed(() =>
{
    const text = query.get().trim().toLowerCase();
    return (tasks.get() ?? []).filter((task) => text === "" || task.title.toLowerCase().includes(text));
});

export const open = computed(() => filtered.get().filter((task) => !task.done));
export const done = computed(() => filtered.get().filter((task) => task.done));

/** Why the last change failed, shown above the list; empty once a change succeeds. */
export const failure = signal("");

/** Runs a change and reloads the list either way, so the page shows what the server holds; resolves to whether the change went through. */
async function change(run: () => Promise<unknown>): Promise<boolean>
{
    try
    {
        await run();
        failure.set("");
        return true;
    }
    catch (error)
    {
        failure.set(error instanceof ProblemError ? error.problem.title ?? "The change was not saved." : "The server could not be reached.");
        return false;
    }
    finally
    {
        tasks.reload();
    }
}

export function toggle(task: Task): Promise<boolean>
{
    return change(() => api.call("updateTask", { params: { id: task.id }, body: { done: !task.done } }));
}

export function remove(id: string): Promise<boolean>
{
    return change(() => api.call("deleteTask", { params: { id } }));
}
