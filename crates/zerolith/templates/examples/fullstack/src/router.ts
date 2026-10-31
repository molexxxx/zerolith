// The routes and the router. The router follows the base path the app is
// served under, /app/ from zerolith.json, so its links and its matching work
// the same under zerolith dev, zerolith preview, and the backend.
import { html } from "zerolith";
import { createRouter, defineRoutes, route } from "@zerolith/router";
import { Notes } from "./notes.ts";

export const routes = defineRoutes({
    home: route({ path: "/", view: () => Notes(), head: { title: "Notes" } }),
    about: route({
        path: "/about",
        view: () => html`
            <section>
                <h1>About</h1>
                <p>The page is served under /app/, and its API under /api, by the backend in server.ts.
                While developing, zerolith dev serves the page and forwards /api to that backend.</p>
            </section>`,
        head: { title: "About" }
    })
});

export const router = createRouter(routes, {
    base: import.meta.env.BASE_URL,
    fallback: (url) => html`<section><h1>Not found</h1><p>Nothing lives at ${url.pathname}.</p></section>`
});
