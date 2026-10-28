// The route table. Parameters are inferred from each path; `router.href`
// in the components is checked against these names and parameters.
import { defineRoutes, route } from "@zerolith/router";
import { NoteForm, NoteList, NoteView } from "./components.js";

const base = "/examples/notes";

export const routes = defineRoutes({
    home: route({
        path: `${base}/`,
        view: () => NoteList(),
        head: { title: "Notes" }
    }),
    create: route({
        path: `${base}/new`,
        view: () => NoteForm({}),
        head: { title: "New note" }
    }),
    note: route({
        path: `${base}/notes/:id`,
        view: ({ params }) => NoteView({ id: params.id }),
        head: ({ params }) => ({ title: `Note ${params.id}` })
    }),
    edit: route({
        path: `${base}/notes/:id/edit`,
        view: ({ params }) => NoteForm({ id: params.id }),
        head: { title: "Edit note" }
    })
});
