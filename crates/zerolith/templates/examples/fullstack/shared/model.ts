// The data the app and the backend exchange. Both sides import these types,
// so a field renamed here fails to type-check wherever it is used.

/** Where a task is on its way to done. */
export type TaskStatus = "todo" | "doing" | "done";

/** The statuses in board order. */
export const statuses: readonly TaskStatus[] = ["todo", "doing", "done"];

/** A member of the team. */
export interface User
{
    id: number;
    name: string;
    email: string;
}

/** The signed-in user, as the session endpoint returns it. */
export interface Session
{
    user: User;
}

/** A project with the counts its card shows. */
export interface Project
{
    id: number;
    name: string;
    summary: string;
    open: number;
    done: number;
}

/** One task of a project. `due` is a calendar date such as `2026-11-04`, or null. */
export interface Task
{
    id: number;
    projectId: number;
    title: string;
    status: TaskStatus;
    due: string | null;
}

/** A project with its tasks, for the project page. */
export interface ProjectDetail
{
    project: Project;
    tasks: Task[];
}

/** One line of the activity feed. `at` is an ISO timestamp. */
export interface Activity
{
    id: number;
    at: string;
    who: string;
    text: string;
}

/** The numbers the dashboard leads with. */
export interface Summary
{
    projects: number;
    open: number;
    dueSoon: number;
    doneThisWeek: number;
}
