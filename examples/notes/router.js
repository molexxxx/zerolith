// The router, in its own module so components can import it for typed
// hrefs and navigation while the route table imports the components.
import { createRouter } from "@zerolith/router";
import { NotFound } from "./components.js";
import { routes } from "./routes.js";

/** @type {import("@zerolith/router").Router<typeof routes>} */
export const router = createRouter(routes, { fallback: () => NotFound() });
