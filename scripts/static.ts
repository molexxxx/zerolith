/**
 * A static file server for one folder of the repository, the built docs
 * site, for `npm run docs:serve` and the site tests. Every file is served
 * to any origin, as GitHub Pages serves the docs, so the playground's
 * sandboxed frame can load its modules; so it answers only a request
 * addressed to the loopback interface, which a page using DNS rebinding
 * cannot send, never serves a dot-folder such as `.git`, and serves no
 * folder but the one it is given.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
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

/** The file a request path maps to under `root`, or undefined for a path into a dot-folder or to a dot-file. Throws a `URIError` for a malformed percent escape. */
export function resolvePath(pathname: string, root: string): string | undefined
{
    const path = normalize(decodeURIComponent(pathname)).replace(/^([.][.][\\/])+/, "");
    if (path.split(/[\\/]/).some((segment) => segment.startsWith(".") && segment !== "." && segment !== ".."))
    {
        return undefined;
    }
    return join(root, path);
}

/** True when the request names the loopback interface as its host, as a browser on the same machine does. */
function loopback(host: string | undefined): boolean
{
    try
    {
        return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(`http://${host ?? ""}`).hostname);
    }
    catch
    {
        return false;
    }
}

/** Creates the server for `root`, such as the repository's `site/` folder, without listening. */
export function createStaticServer(root: string): Server
{
    return createServer(async (request, response) =>
    {
        const answer = (status: number, text: string): void =>
        {
            response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" });
            response.end(text);
        };
        if (!loopback(request.headers.host))
        {
            answer(403, "This server answers only requests to 127.0.0.1 or localhost");
            return;
        }
        let file: string | undefined;
        try
        {
            file = resolvePath(new URL(request.url ?? "/", "http://localhost").pathname, root);
        }
        catch
        {
            answer(400, "Bad request");
            return;
        }
        try
        {
            if (file === undefined)
            {
                throw new Error("a dot-folder");
            }
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
            answer(404, "Not found");
        }
    });
}

/** Listens on a free port on the loopback interface and returns the origin. */
export async function listen(server: Server, port = 0): Promise<string>
{
    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
