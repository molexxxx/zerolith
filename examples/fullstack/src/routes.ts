// The route table: the pages a signed-in member moves between. The project
// page's data loads before the page opens, and its code is imported the
// first time it is opened, as a chunk of its own.
import { defineRoutes, lazy, route } from "@zerolith/router";
import { Dashboard } from "./components/dashboard.ts";
import { Projects } from "./components/projects.ts";
import { loadProject } from "./store.ts";

export const routes = defineRoutes({
    dashboard: route({ path: "/", view: () => Dashboard(), head: { title: "Dashboard | Harbor" } }),
    projects: route({ path: "/projects", view: () => Projects(), head: { title: "Projects | Harbor" } }),
    project: route({
        path: "/projects/:id",
        load: loadProject,
        view: lazy(() => import("./components/project.ts").then((module) => module.ProjectPage)),
        head: ({ data }) => ({ title: `${data?.project.name ?? "No such project"} | Harbor` })
    })
});
