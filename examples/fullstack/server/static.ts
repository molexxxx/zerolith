// Serving the built app in production: the files `zerolith build` wrote to
// dist/, under the base path the app was built for.
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

// #region static
const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8"
};

/**
 * Serves a zerolith build from `dist` under `base`: a file that exists is
 * sent with its type, the hashed files under assets/ are cached for a year,
 * and any other path under the base gets index.html, uncached, so routes
 * load directly and a new build is picked up at once.
 */
export async function serveApp(request: Request, dist: string, base: string): Promise<Response>
{
    const { pathname } = new URL(request.url);
    if (pathname === "/" || pathname === base.slice(0, -1))
    {
        return new Response(null, { status: 302, headers: { location: base } });
    }
    const relative = normalize(decodeURIComponent(pathname.slice(base.length)));
    const file = resolve(dist, relative);
    if (!pathname.startsWith(base) || (!file.startsWith(resolve(dist) + sep) && file !== resolve(dist)))
    {
        return new Response(null, { status: 404 });
    }
    if (extname(file) === "")
    {
        const page = await readFile(join(dist, "index.html"));
        return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    }
    const content = await readFile(file).catch(() => undefined);
    if (content === undefined)
    {
        return new Response(null, { status: 404 });
    }
    return new Response(content, {
        headers: {
            "content-type": types[extname(file)] ?? "application/octet-stream",
            "cache-control": relative.startsWith(`assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache"
        }
    });
}
// #endregion static
