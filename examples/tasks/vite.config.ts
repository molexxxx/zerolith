// The example's Vite configuration: the zerolith plugin for hot replacement,
// and the task API from server.ts mounted on the dev server, so the example
// runs with `vite` alone.
import { type Plugin, defineConfig } from "vite";
import { zerolith } from "@zerolith/vite";
import { answer, createTaskApi } from "./server.ts";

/** The in-memory task API under /api, as a Connect middleware. */
function api(): Plugin
{
    const handle = createTaskApi();
    return {
        name: "tasks-api",
        configureServer(server)
        {
            server.middlewares.use((request, response, next) =>
            {
                answer(handle, request, response)
                    .then((answered) =>
                    {
                        if (!answered)
                        {
                            next();
                        }
                    })
                    .catch((error: unknown) => next(error));
            });
        }
    };
}

export default defineConfig({
    plugins: [zerolith(), api()],
    server: { port: 5173, strictPort: false }
});
