// The backend's data, kept in memory so the example runs with nothing to
// install. A real backend keeps the same shapes in a database and stores
// password hashes, never passwords.
import type { Activity, Project, Summary, Task, User } from "../shared/model.ts";

/** A task as the backend stores it, with when it was finished. */
export interface StoredTask extends Task
{
    doneAt: string | null;
}

/** Everything the backend knows. */
export interface Data
{
    users: (User & { password: string })[];
    projects: { id: number; name: string; summary: string }[];
    tasks: StoredTask[];
    activity: Activity[];
    /** Each session's member and the time, in milliseconds since the epoch, after which it is no longer accepted. */
    sessions: Map<string, { userId: number; expires: number }>;
    ids: { project: number; task: number; activity: number };
}

const DAY = 24 * 60 * 60 * 1000;

/** The calendar date `offset` days from `today`. */
function date(today: Date, offset: number): string
{
    return new Date(today.getTime() + offset * DAY).toISOString().slice(0, 10);
}

/** A fresh copy of the data the example starts with, dated around `today`. */
export function seed(today: Date = new Date()): Data
{
    const at = (minutes: number): string => new Date(today.getTime() - minutes * 60 * 1000).toISOString();
    const task = (id: number, projectId: number, title: string, status: Task["status"], due: number | null): StoredTask =>
        ({ id, projectId, title, status, due: due === null ? null : date(today, due), doneAt: status === "done" ? at(id * 90) : null });
    return {
        users: [
            { id: 1, name: "Ada Lovelace", email: "ada@harbor.test", password: "analytical" },
            { id: 2, name: "Grace Hopper", email: "grace@harbor.test", password: "compiler" }
        ],
        projects: [
            { id: 1, name: "Website relaunch", summary: "A faster site with a new look, live before the conference." },
            { id: 2, name: "Mobile app", summary: "The first release for phones: sign in, projects, and tasks." },
            { id: 3, name: "Quarterly planning", summary: "Goals and owners for the next three months." }
        ],
        tasks: [
            task(1, 1, "Write the new home page copy", "done", -3),
            task(2, 1, "Design the pricing page", "doing", 2),
            task(3, 1, "Move the blog to the new templates", "todo", 6),
            task(4, 1, "Set up redirects for old addresses", "todo", 9),
            task(5, 2, "Sign in with a passkey", "doing", 1),
            task(6, 2, "Offline list of tasks", "todo", 12),
            task(7, 2, "Push notifications for due tasks", "todo", null),
            task(8, 2, "Release to beta testers", "done", -1),
            task(9, 3, "Collect goals from every team", "doing", 4),
            task(10, 3, "Draft the plan", "todo", 8)
        ],
        activity: [
            { id: 1, at: at(240), who: "Grace Hopper", text: "created the project Mobile app" },
            { id: 2, at: at(95), who: "Ada Lovelace", text: "finished Write the new home page copy" },
            { id: 3, at: at(30), who: "Grace Hopper", text: "finished Release to beta testers" },
            { id: 4, at: at(8), who: "Ada Lovelace", text: "started Design the pricing page" }
        ],
        sessions: new Map(),
        ids: { project: 3, task: 10, activity: 4 }
    };
}

/** A project with the counts its card shows. */
export function projectOf(data: Data, project: Data["projects"][number]): Project
{
    const tasks = data.tasks.filter((task) => task.projectId === project.id);
    return { ...project, open: tasks.filter((task) => task.status !== "done").length, done: tasks.filter((task) => task.status === "done").length };
}

/** A task as the API returns it, without the backend's own fields. */
export function taskOf(stored: StoredTask): Task
{
    return { id: stored.id, projectId: stored.projectId, title: stored.title, status: stored.status, due: stored.due };
}

/** The dashboard's numbers, as of `now`. */
export function summaryOf(data: Data, now: Date = new Date()): Summary
{
    const soon = date(now, 7);
    const weekAgo = now.getTime() - 7 * DAY;
    const open = data.tasks.filter((task) => task.status !== "done");
    return {
        projects: data.projects.length,
        open: open.length,
        dueSoon: open.filter((task) => task.due !== null && task.due <= soon).length,
        doneThisWeek: data.tasks.filter((task) => task.doneAt !== null && Date.parse(task.doneAt) >= weekAgo).length
    };
}

/** Adds a line to the activity feed, keeping the latest fifty, and returns it. */
export function record(data: Data, who: string, text: string): Activity
{
    data.ids.activity += 1;
    const entry = { id: data.ids.activity, at: new Date().toISOString(), who, text };
    data.activity = [...data.activity, entry].slice(-50);
    return entry;
}
