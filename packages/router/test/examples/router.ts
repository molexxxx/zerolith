import { createRouter } from "@zerolith/router";
import { NotFound } from "./components/not-found.tsx";
import { routes } from "./routes.ts";

export const router = createRouter(() => routes, {
    focus: "h1",
    fallback: (url) => NotFound({ path: url.pathname })
});
