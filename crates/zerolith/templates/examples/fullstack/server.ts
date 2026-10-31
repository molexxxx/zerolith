// The backend of the fullstack example: a JSON API under /api and, in
// production, the built application under /app/, from one Node server with
// no dependencies. While developing, zerolith dev serves the application and
// forwards /api here, as zerolith.json says.
import { readFile } from "node:fs/promises";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** A note, as the API stores and returns it. */
export interface Note
{
    id: number;
    text: string;
}

/** What the server serves: the API always, and the built application when `dist` names its folder. */
export interface BackendOptions
{
    dist?: string;
    base?: string;
}

function json(response: ServerResponse, status: number, value: unknown): void
{
    response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(value));
}

async function text(request: IncomingMessage): Promise<string>
{
    const chunks: Buffer[] = [];
    for await (const chunk of request)
    {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
}

function parse(body: string): unknown
{
    try
    {
        return (JSON.parse(body) as { text?: unknown }).text;
    }
    catch
    {
        return undefined;
    }
}

/** The notes API: `GET` lists the notes, and `POST` adds one from `{ "text": "..." }`. */
async function api(request: IncomingMessage, response: ServerResponse, notes: Note[]): Promise<void>
{
    if (request.method === "GET")
    {
        json(response, 200, notes);
        return;
    }
    if (request.method === "POST")
    {
        const value = parse(await text(request));
        if (typeof value !== "string" || value.trim() === "")
        {
            json(response, 400, { title: "A note needs text", status: 400 });
            return;
        }
        const note = { id: notes.length + 1, text: value.trim() };
        notes.push(note);
        json(response, 201, note);
        return;
    }
    response.writeHead(405, { allow: "GET, POST" }).end();
}

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
async function serveApp(request: IncomingMessage, response: ServerResponse, dist: string, base: string): Promise<void>
{
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    if (pathname === "/" || pathname === base.slice(0, -1))
    {
        response.writeHead(302, { location: base }).end();
        return;
    }
    if (!pathname.startsWith(base))
    {
        response.writeHead(404).end();
        return;
    }
    const relative = normalize(decodeURIComponent(pathname.slice(base.length)));
    const file = resolve(dist, relative);
    if (!file.startsWith(resolve(dist) + sep) && file !== resolve(dist))
    {
        response.writeHead(404).end();
        return;
    }
    if (extname(file) === "")
    {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
        response.end(await readFile(join(dist, "index.html")));
        return;
    }
    const content = await readFile(file).catch(() => undefined);
    if (content === undefined)
    {
        response.writeHead(404).end();
        return;
    }
    response.writeHead(200, {
        "content-type": types[extname(file)] ?? "application/octet-stream",
        "cache-control": relative.startsWith(`assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache"
    });
    response.end(content);
}
// #endregion static

/** The backend as a Node server, not yet listening. */
export function createBackend(options: BackendOptions = {}): Server
{
    const notes: Note[] = [
        { id: 1, text: "Develop with zerolith dev, which forwards /api here" },
        { id: 2, text: "Serve the build from this server under /app/" }
    ];
    const base = options.base ?? "/app/";
    return createServer((request, response) =>
    {
        const { pathname } = new URL(request.url ?? "/", "http://localhost");
        const handled = pathname === "/api/notes"
            ? api(request, response, notes)
            : options.dist === undefined
                ? Promise.resolve(void response.writeHead(404).end())
                : serveApp(request, response, options.dist, base);
        handled.catch(() =>
        {
            if (!response.headersSent)
            {
                response.writeHead(500);
            }
            response.end();
        });
    });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
    const production = process.argv.includes("--production");
    const port = Number(process.env["PORT"] ?? "3001");
    const backend = production ? createBackend({ dist: fileURLToPath(new URL("./dist/", import.meta.url)) }) : createBackend();
    backend.listen(port, "127.0.0.1", () =>
    {
        process.stdout.write(production
            ? `fullstack: the API and the built app at http://127.0.0.1:${port}/app/\n`
            : `fullstack: the API at http://127.0.0.1:${port}/api/notes\n`);
    });
}
