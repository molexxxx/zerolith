/**
 * A static file server over the repository root for examples and tests:
 * `/packages/*\/dist` serves the built packages the import maps point at,
 * and an extensionless path under `/examples/<name>/` falls back to that
 * example's index.html so client-side routes load directly. Every file is
 * served to any origin, as GitHub Pages serves the docs, so the playground's
 * sandboxed frame can load its modules here too.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const types: Readonly<Record<string, string>> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".map": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8"
};

export const repositoryRoot: string = fileURLToPath(new URL("../", import.meta.url));

/** The file a request path maps to under `root`, after the example fallback. */
export function resolvePath(pathname: string, root: string = repositoryRoot): string
{
    let path = normalize(decodeURIComponent(pathname)).replace(/^([.][.][\\/])+/, "");
    const example = /^[\\/]examples[\\/]([^\\/]+)(?:[\\/]|$)/.exec(path);
    if (example !== null && (path.endsWith(sep) || path.endsWith("/") || extname(path) === ""))
    {
        path = join("examples", example[1] ?? "", "index.html");
    }
    return join(root, path);
}

/** Creates the server without listening. `root` defaults to the repository; pass `site/` to serve the built docs at `/`. */
export function createStaticServer(root: string = repositoryRoot): Server
{
    return createServer(async (request, response) =>
    {
        const url = new URL(request.url ?? "/", "http://localhost");
        let file = resolvePath(url.pathname, root);
        try
        {
            let info = await stat(file);
            if (info.isDirectory())
            {
                file = join(file, "index.html");
                info = await stat(file);
            }
            if (!info.isFile())
            {
                throw new Error("not a file");
            }
            response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache", "access-control-allow-origin": "*" });
            createReadStream(file).pipe(response);
        }
        catch
        {
            response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            response.end("Not found");
        }
    });
}

/** Listens on a free port on the loopback interface and returns the origin. */
export async function listen(server: Server, port = 0): Promise<string>
{
    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
