// The route table; parameters are inferred from the paths.
import { defineRoutes, route } from "@zerolith/router";
import { TaskForm, TaskList, TaskView } from "./components.ts";

export const routes = defineRoutes({
    home: route({ path: "/", view: () => TaskList(), head: { title: "Tasks" } }),
    create: route({ path: "/new", view: () => TaskForm(), head: { title: "New task" } }),
    task: route({ path: "/tasks/:id", view: ({ params }) => TaskView({ id: params.id }), head: ({ params }) => ({ title: `Task ${params.id}` }) })
});
