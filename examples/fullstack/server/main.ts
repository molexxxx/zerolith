// Starts the backend. `node server/main.ts` serves the API for zerolith dev
// to forward /api to while developing; `node server/main.ts --production`
// also serves the app that zerolith build wrote to dist/, as in production.
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { serve } from "./node.ts";

const production = process.argv.includes("--production");
const port = Number(process.env["PORT"] ?? "3001");
const dist = fileURLToPath(new URL("../dist/", import.meta.url));

await serve(createApp(production ? { dist } : {}), port);
process.stdout.write(production
    ? `Harbor: the app and its API at http://127.0.0.1:${port}/app/\n`
    : `Harbor: the API at http://127.0.0.1:${port}/api/, which zerolith dev forwards to\n`);
