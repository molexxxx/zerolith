// Serves the built example the way a backend serves a frontend: the files
// `zerolith build` wrote, the task API from server.ts next to them, and
// index.html for every other path so client-side routes load directly.
//   node examples/tasks/preview.ts [port]
import { existsSync, readFileSync } from "node:fs";
import { type Server, createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { answer, createTaskApi } from "./server.ts";

const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json"
};

/** A server for a build's output folder with the task API beside it. */
export function createPreviewServer(out: string): Server
{
    const api = createTaskApi();
    return createServer((request, response) =>
    {
        answer(api, request, response)
            .then((answered) =>
            {
                if (answered)
                {
                    return;
                }
                const path = normalize(decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname));
                const file = join(out, path);
                const target = file.startsWith(out) && extname(path) !== "" && existsSync(file) ? file : join(out, "index.html");
                response.setHeader("content-type", types[extname(target)] ?? "application/octet-stream");
                response.end(readFileSync(target));
            })
            .catch((error: unknown) =>
            {
                response.statusCode = 500;
                response.end(String(error));
            });
    });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
    const out = fileURLToPath(new URL("./dist/", import.meta.url));
    if (!existsSync(join(out, "index.html")))
    {
        process.stderr.write("Build the example first: npm run tasks:build\n");
        process.exit(1);
    }
    const port = Number(process.argv[2] ?? "4173");
    createPreviewServer(out).listen(port, "127.0.0.1", () =>
    {
        process.stdout.write(`tasks: serving ${out} with the API at http://127.0.0.1:${port}/\n`);
    });
}
