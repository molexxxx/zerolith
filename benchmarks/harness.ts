/**
 * What the benchmark scripts share: the keyed-table operations of
 * js-framework-benchmark with the CPU slowdown it runs each under, a server
 * for the benchmark pages, and one timed sample of an operation.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";

/** An operation of the keyed table: the name its page's `bench` object uses, a label, and the CPU slowdown js-framework-benchmark measures it under. */
export interface Operation
{
    name: string;
    label: string;
    slowdown: number;
}

export const operations: readonly Operation[] = [
    { name: "create", label: "create 1,000 rows", slowdown: 1 },
    { name: "replace", label: "replace all rows", slowdown: 1 },
    { name: "partial", label: "update every 10th row", slowdown: 4 },
    { name: "select", label: "select a row", slowdown: 4 },
    { name: "swap", label: "swap two rows", slowdown: 4 },
    { name: "remove", label: "remove a row", slowdown: 2 },
    { name: "createMany", label: "create 10,000 rows", slowdown: 1 },
    { name: "append", label: "append 1,000 rows", slowdown: 1 },
    { name: "clear", label: "clear rows", slowdown: 4 }
];

/** A benchmark page: the script in `web/` it runs and, for a zerolith page, the served folder its import map points `zerolith` at. */
export interface BenchPage
{
    script: string;
    core?: string;
}

const web = fileURLToPath(new URL("./web/", import.meta.url));

function html(page: BenchPage): string
{
    const map = page.core === undefined ? "" : `<script type="importmap">{"imports":{"zerolith":"/${page.core}/index.js"}}</script>\n`;
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>bench ${page.script}</title>
${map}<script type="module" src="/web/${page.script}.js"></script>
</head>
<body><div id="main"></div></body>
</html>`;
}

/** Cross-origin isolation, which gives `performance.now()` microsecond resolution in place of a tenth of a millisecond. */
const ISOLATED = { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" };

/**
 * Serves `/bench/<name>` for each page, the scripts in `web/` under `/web/`,
 * and each folder of `cores` under `/<key>/`, on a free loopback port.
 */
export async function serve(pages: Readonly<Record<string, BenchPage>>, cores: Readonly<Record<string, string>>): Promise<{ origin: string; close: () => void }>
{
    const roots = [["web", web], ...Object.entries(cores)];
    const server = createServer(async (request, response) =>
    {
        const url = new URL(request.url ?? "/", "http://localhost");
        const page = url.pathname.startsWith("/bench/") ? pages[url.pathname.slice("/bench/".length)] : undefined;
        if (page !== undefined)
        {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...ISOLATED });
            response.end(html(page));
            return;
        }
        for (const [prefix, folder] of roots)
        {
            const rest = url.pathname.slice(`/${prefix}/`.length);
            if (url.pathname.startsWith(`/${prefix}/`) && rest.endsWith(".js") && !rest.includes(".."))
            {
                try
                {
                    const body = await readFile(join(folder ?? "", rest));
                    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", ...ISOLATED });
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
    return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => server.close() };
}

/** Opens a benchmark page and waits for its `bench` object; a page error fails the run. */
export async function open(tab: Page, url: string): Promise<void>
{
    tab.on("pageerror", (error) =>
    {
        throw error;
    });
    await tab.goto(url);
    await tab.waitForFunction(() => typeof (globalThis as unknown as { bench?: unknown }).bench === "object");
}

/**
 * Times one run of an operation in milliseconds; every operation but the two
 * creates starts from 1,000 fresh rows, which are not timed. With `collect`,
 * garbage is collected before the timing starts, which needs Chromium
 * launched with `--js-flags=--expose-gc`.
 */
export async function sample(tab: Page, name: string, collect = false): Promise<number>
{
    if (name !== "create" && name !== "createMany")
    {
        await tab.evaluate(() => (globalThis as unknown as { bench: Record<string, () => Promise<number>> }).bench["create"]?.());
    }
    if (collect)
    {
        await tab.evaluate(() => (globalThis as unknown as { gc?: () => void }).gc?.());
    }
    return tab.evaluate((operation) => (globalThis as unknown as { bench: Record<string, () => Promise<number>> }).bench[operation]?.() ?? Promise.resolve(0), name);
}

/** The rows a page holds, which must be none after `clear`. */
export async function rowCount(tab: Page): Promise<number>
{
    return tab.evaluate(() => (globalThis as unknown as { bench: { count(): number } }).bench.count());
}

export function median(values: readonly number[]): number
{
    const sorted = values.toSorted((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] ?? 0 : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
