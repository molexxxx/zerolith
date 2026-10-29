// The router, in its own module so components can import it for typed
// hrefs while the route table imports the components.
import { createRouter } from "@zerolith/router";
import { NotFound } from "./components.ts";
import { routes } from "./routes.ts";

export const router = createRouter(routes, { fallback: () => NotFound() });
