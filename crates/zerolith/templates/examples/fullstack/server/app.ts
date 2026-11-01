// The backend as one function from a Request to a Response: the API under
// /api and, when given a build, the app under its base path. Node runs it
// through server/node.ts, and a test calls it directly, with no port.
import { createApi } from "./api.ts";
import { seed } from "./data.ts";
import { createEvents } from "./events.ts";
import { serveApp } from "./static.ts";

/** What the backend serves besides the API. */
export interface AppOptions
{
    /** The folder `zerolith build` wrote, to serve the app from in production. */
    dist?: string;
    /** The path the app was built for. */
    base?: string;
}

export function createApp(options: AppOptions = {}): (request: Request) => Promise<Response>
{
    const api = createApi(seed(), createEvents());
    const base = options.base ?? "/app/";
    return (request) =>
    {
        if (new URL(request.url).pathname.startsWith("/api/"))
        {
            return api(request);
        }
        return options.dist === undefined ? Promise.resolve(new Response(null, { status: 404 })) : serveApp(request, options.dist, base);
    };
}
