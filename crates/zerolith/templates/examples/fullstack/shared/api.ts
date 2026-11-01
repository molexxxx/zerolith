// The API both sides agree on: each operation's method, path, inputs, and
// output. The backend answers exactly these routes, and the app calls them
// through a client typed by this interface, so a route or a field that
// changes here fails to type-check wherever it is used. A backend in another
// language would publish an OpenAPI document instead, and zerolith-client
// would generate this module from it.
import type { RouteTable } from "@zerolith/client";
import type { Activity, Project, ProjectDetail, Session, Summary, Task } from "./model.ts";
import type { NewProject, NewTask, SignIn, TaskChange } from "./schema.ts";

export interface Api
{
    getSession: { method: "get"; path: "/api/session"; output: Session };
    signIn: { method: "post"; path: "/api/session"; body: SignIn; output: Session };
    signOut: { method: "delete"; path: "/api/session"; output: undefined };
    getSummary: { method: "get"; path: "/api/summary"; output: Summary };
    listActivity: { method: "get"; path: "/api/activity"; output: Activity[] };
    listProjects: { method: "get"; path: "/api/projects"; output: Project[] };
    createProject: { method: "post"; path: "/api/projects"; body: NewProject; output: Project };
    getProject: { method: "get"; path: "/api/projects/{id}"; params: { id: number }; output: ProjectDetail };
    createTask: { method: "post"; path: "/api/projects/{id}/tasks"; params: { id: number }; body: NewTask; output: Task };
    updateTask: { method: "patch"; path: "/api/tasks/{id}"; params: { id: number }; body: TaskChange; output: Task };
    deleteTask: { method: "delete"; path: "/api/tasks/{id}"; params: { id: number }; output: undefined };
}

export const routes: RouteTable<Api> = {
    getSession: { method: "get", path: "/api/session" },
    signIn: { method: "post", path: "/api/session" },
    signOut: { method: "delete", path: "/api/session" },
    getSummary: { method: "get", path: "/api/summary" },
    listActivity: { method: "get", path: "/api/activity" },
    listProjects: { method: "get", path: "/api/projects" },
    createProject: { method: "post", path: "/api/projects" },
    getProject: { method: "get", path: "/api/projects/{id}" },
    createTask: { method: "post", path: "/api/projects/{id}/tasks" },
    updateTask: { method: "patch", path: "/api/tasks/{id}" },
    deleteTask: { method: "delete", path: "/api/tasks/{id}" }
};

/** Where the live activity stream is served, as server-sent events. */
export const EVENTS_PATH = "/api/events";
