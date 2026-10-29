// Data through the typed client: the list is a resource over the API, and
// the operations that change it reload the list when they succeed.
import { computed, signal } from "zerolith";
import { createClient } from "@zerolith/client";
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

export async function toggle(task: Task): Promise<void>
{
    await api.call("updateTask", { params: { id: task.id }, body: { done: !task.done } });
    tasks.reload();
}

export async function remove(id: string): Promise<void>
{
    await api.call("deleteTask", { params: { id } });
    tasks.reload();
}
