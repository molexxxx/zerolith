// The router, in its own module so components can import it for typed links
// while the route table imports the components. It follows the base path the
// app is served under, /app/ from zerolith.json, so links and matching work
// the same under zerolith dev, zerolith preview, and the backend.
import { createRouter } from "@zerolith/router";
import { NotFound } from "./components/not-found.ts";
import { routes } from "./routes.ts";

export const router = createRouter(routes, {
    base: import.meta.env.BASE_URL,
    fallback: (url) => NotFound({ path: url.pathname })
});
