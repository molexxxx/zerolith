// The starter's src/router.ts, without the page for a path no route matches.
import { createRouter } from "@zerolith/router";
import { routes } from "./routes.ts";

export const router = createRouter(() => routes, {
    base: import.meta.env.BASE_URL
});
