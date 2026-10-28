/**
 * Runs the keyed-table benchmark (the js-framework-benchmark operation set)
 * for zerolith and for a vanilla DOM baseline in headless Chromium and
 * prints the median of each operation and the ratio between them. The
 * zerolith page loads the production entry unbundled through an import map,
 * the same way a buildless deployment would.
 */
import { readFile } from "node:fs/promises";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const dist = fileURLToPath(new URL("../packages/zerolith/dist/production/", import.meta.url));
const web = fileURLToPath(new URL("./web/", import.meta.url));

const operations = [
    ["create", "create 1,000 rows"],
    ["replace", "replace all rows"],
    ["partial", "update every 10th row"],
    ["select", "select a row"],
    ["swap", "swap two rows"],
    ["remove", "remove a row"],
    ["createMany", "create 10,000 rows"],
    ["append", "append 1,000 rows"],
    ["clear", "clear rows"]
] as const;

const iterations = Number(process.argv[2] ?? 7);

function page(implementation: string): string
{
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>bench ${implementation}</title>
<script type="importmap">{"imports":{"zerolith":"/zerolith/index.js"}}</script>
<script type="module" src="/web/${implementation}.js"></script>
</head>
<body><div id="main"></div></body>
</html>`;
}

const server: Server = createServer(async (request, response) =>
{
    const url = request.url ?? "/";
    if (url.startsWith("/bench/"))
    {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(page(url.slice("/bench/".length)));
        return;
    }
    const roots: Array<[string, string]> = [["/zerolith/", dist], ["/web/", web]];
    for (const [prefix, folder] of roots)
    {
        if (url.startsWith(prefix) && url.endsWith(".js") && !url.includes(".."))
        {
            try
            {
                const body = await readFile(folder + url.slice(prefix.length));
                response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
                response.end(body);
            }
            catch
            {
                response.writeHead(404);
                response.end();
            }
            return;
        }
    }
    response.writeHead(404);
    response.end();
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

function median(values: number[]): number
{
    const sorted = values.toSorted((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function run(implementation: string): Promise<Map<string, number>>
{
    const browser = await chromium.launch();
    const tab = await browser.newPage();
    tab.on("pageerror", (error) =>
    {
        throw error;
    });
    await tab.goto(`${origin}/bench/${implementation}`);
    await tab.waitForFunction(() => typeof (globalThis as unknown as { bench?: unknown }).bench === "object");
    const results = new Map<string, number>();
    for (const [name] of operations)
    {
        const samples: number[] = [];
        for (let i = 0; i < iterations; i++)
        {
            if (name !== "create" && name !== "createMany")
            {
                await tab.evaluate(() => (globalThis as unknown as { bench: Record<string, () => Promise<number>> }).bench["create"]?.());
            }
            samples.push(await tab.evaluate((operation) => (globalThis as unknown as { bench: Record<string, () => Promise<number>> }).bench[operation]?.() ?? Promise.resolve(0), name));
        }
        results.set(name, median(samples));
    }
    const rowsAfterClear = await tab.evaluate(() => (globalThis as unknown as { bench: { count(): number } }).bench.count());
    if (rowsAfterClear !== 0)
    {
        throw new Error(`${implementation}: ${rowsAfterClear} rows left after clear`);
    }
    await browser.close();
    return results;
}

const vanilla = await run("vanilla");
const zerolith = await run("zerolith");
server.close();

console.log(`median of ${iterations} runs, milliseconds of script plus forced style and layout`);
console.log("operation".padEnd(24) + "vanilla".padStart(10) + "zerolith".padStart(10) + "ratio".padStart(8));
let product = 1;
for (const [name, label] of operations)
{
    const base = vanilla.get(name) ?? 0;
    const ours = zerolith.get(name) ?? 0;
    const ratio = base > 0 ? ours / base : 0;
    product *= ratio > 0 ? ratio : 1;
    console.log(label.padEnd(24) + base.toFixed(1).padStart(10) + ours.toFixed(1).padStart(10) + ratio.toFixed(2).padStart(8));
}
console.log("geometric mean ratio".padEnd(24) + "".padStart(20) + Math.pow(product, 1 / operations.length).toFixed(2).padStart(8));
