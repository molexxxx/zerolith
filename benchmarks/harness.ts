/**
 * What the benchmark scripts share: the keyed-table operations of
 * js-framework-benchmark with the CPU slowdown it runs each under, a server
 * for the benchmark pages and for two of them side by side in one page, and
 * the measurement of two pages against each other.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, Frame, Page } from "playwright";

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

/** The names of the two frames a pair page holds, in order. */
const PAIR_FRAMES = ["first", "second"] as const;

function pairHtml(names: readonly [string, string]): string
{
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>bench ${names[0]} and ${names[1]}</title>
<style>html, body { margin: 0; height: 100%; } body { display: flex; } iframe { flex: 1; border: 0; }</style>
</head>
<body><iframe name="${PAIR_FRAMES[0]}" src="/bench/${names[0]}"></iframe><iframe name="${PAIR_FRAMES[1]}" src="/bench/${names[1]}"></iframe></body>
</html>`;
}

/** Cross-origin isolation, which gives `performance.now()` microsecond resolution in place of a tenth of a millisecond. */
const ISOLATED = { "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" };

/**
 * Serves `/bench/<name>` for each page, `/pair/<name>/<name>` for two of
 * them side by side in one document, the scripts in `web/` under `/web/`,
 * and each folder of `cores` under `/<key>/`, on a free loopback port.
 */
export async function serve(pages: Readonly<Record<string, BenchPage>>, cores: Readonly<Record<string, string>>): Promise<{ origin: string; close: () => void }>
{
    const roots = [["web", web], ...Object.entries(cores)];
    const named = (name: string | undefined): BenchPage | undefined => (name !== undefined && Object.hasOwn(pages, name) ? pages[name] : undefined);
    const server = createServer(async (request, response) =>
    {
        const url = new URL(request.url ?? "/", "http://localhost");
        const page = url.pathname.startsWith("/bench/") ? named(url.pathname.slice("/bench/".length)) : undefined;
        if (page !== undefined)
        {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...ISOLATED });
            response.end(html(page));
            return;
        }
        const [, first, second] = /^\/pair\/([^/]+)\/([^/]+)$/.exec(url.pathname) ?? [];
        if (first !== undefined && second !== undefined && named(first) !== undefined && named(second) !== undefined)
        {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8", ...ISOLATED });
            response.end(pairHtml([first, second]));
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

/** A promise that rejects with each benchmark page's first uncaught error. */
const pageFailures = new WeakMap<Page, Promise<never>>();

/** Each benchmark page's first uncaught error, for the check at the end of a run. */
const pageErrors = new WeakMap<Page, Error>();

/** The longest one step on a page may take, so a step whose promise never settles fails the run instead of hanging it. */
const STEP_TIMEOUT_MS = 120000;

/** Waits for a step on a page, failing first with the page's first uncaught error, or once the step outlasts the timeout. */
async function step<T>(tab: Page, work: Promise<T>): Promise<T>
{
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) =>
    {
        timer = setTimeout(() => reject(new Error(`a benchmark step took more than ${STEP_TIMEOUT_MS / 1000} seconds`)), STEP_TIMEOUT_MS);
    });
    try
    {
        return await Promise.race([work, timeout, pageFailures.get(tab) ?? timeout]);
    }
    finally
    {
        clearTimeout(timer);
    }
}

/** Fails the steps on a tab that follow its first uncaught error, from any of its frames, with that error. */
function watch(tab: Page): void
{
    const failure = new Promise<never>((_resolve, reject) => tab.once("pageerror", (error) =>
    {
        pageErrors.set(tab, error);
        reject(error);
    }));
    failure.catch(() => undefined);
    pageFailures.set(tab, failure);
}

/** Waits for a frame's `bench` object. */
async function ready(frame: Frame): Promise<void>
{
    await step(frame.page(), frame.waitForFunction(() => typeof (globalThis as unknown as { bench?: unknown }).bench === "object"));
}

/**
 * Opens two benchmark pages side by side in one tab, so both run in its
 * renderer process and meet the same load wherever the system runs it, and
 * returns their frames once both have their `bench` object; an uncaught
 * error in either fails the open or the step it happens in.
 */
async function openPair(tab: Page, origin: string, names: readonly [string, string]): Promise<readonly [Frame, Frame]>
{
    watch(tab);
    await step(tab, tab.goto(`${origin}/pair/${names[0]}/${names[1]}`));
    const first = tab.frame({ name: PAIR_FRAMES[0] });
    const second = tab.frame({ name: PAIR_FRAMES[1] });
    if (first === null || second === null)
    {
        throw new Error(`the pair page of ${names.join(" and ")} has no frames named ${PAIR_FRAMES.join(" and ")}`);
    }
    await Promise.all([ready(first), ready(second)]);
    return [first, second];
}

/**
 * Times one run of an operation in milliseconds in a frame of a pair page,
 * with garbage collected before the timing starts; every operation but the
 * two creates starts from 1,000 fresh rows, which are not timed.
 */
async function sample(frame: Frame, name: string): Promise<number>
{
    const tab = frame.page();
    if (name !== "create" && name !== "createMany")
    {
        await step(tab, frame.evaluate(() => (globalThis as unknown as { bench: Record<string, () => Promise<number>> }).bench["create"]?.()));
    }
    await step(tab, frame.evaluate(() => (globalThis as unknown as { gc?: () => void }).gc?.()));
    return step(tab, frame.evaluate((operation) => (globalThis as unknown as { bench: Record<string, () => Promise<number>> }).bench[operation]?.() ?? Promise.resolve(0), name));
}

/** Throws the page's first uncaught error, for an error raised after the last step, once the page is done. */
function checkPage(tab: Page): void
{
    const error = pageErrors.get(tab);
    if (error !== undefined)
    {
        throw error;
    }
}

/** The rows a benchmark page holds, which must be none after `clear`. */
async function rowCount(frame: Frame): Promise<number>
{
    return step(frame.page(), frame.evaluate(() => (globalThis as unknown as { bench: { count(): number } }).bench.count()));
}

function median(values: readonly number[]): number
{
    const sorted = values.toSorted((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] ?? 0 : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Below this many milliseconds a sample is mostly timer resolution, so an operation that fast is shown but left out of an overall factor. */
export const MEASURABLE_MS = 1;

/** One operation's time on each of two pages, in the order the pages were named, in milliseconds. */
export interface PairedTime
{
    operation: Operation;
    times: readonly [number, number];
}

/** One operation's medians in a measurement: each page's in each frame it ran in. */
interface Medians
{
    operation: Operation;
    medians: readonly [number[], number[]];
}

/** Both frames of a pair page, by position. */
const BOTH = [0, 1] as const;

/** Which page each frame holds, in turn: the pages trade frames, so each is sampled in both. */
const ORDERS = [[0, 1], [1, 0]] as const;

/**
 * Samples every chosen operation `iterations` times on both pages, each in
 * the frame `order` gives it, alternating which frame goes first, and adds
 * each page's median to its results; when every operation ran, the last of
 * them clear, checks that both pages hold no rows.
 */
async function sampleOrder(tab: Page, origin: string, names: readonly [string, string], order: readonly [0 | 1, 0 | 1], results: readonly Medians[], iterations: number, everyOperation: boolean): Promise<void>
{
    const session = await tab.context().newCDPSession(tab);
    const frames = await openPair(tab, origin, [names[order[0]], names[order[1]]]);
    for (const { operation, medians } of results)
    {
        await session.send("Emulation.setCPUThrottlingRate", { rate: operation.slowdown });
        const samples: [number[], number[]] = [[], []];
        for (let i = 0; i < iterations; i++)
        {
            for (const frame of i % 2 === 0 ? BOTH : [1, 0] as const)
            {
                samples[frame].push(await sample(frames[frame], operation.name));
            }
        }
        const times = [median(samples[0]), median(samples[1])] as const;
        for (const frame of BOTH)
        {
            medians[order[frame]].push(times[frame]);
        }
        console.log(`${operation.label}: ${names[order[0]]} ${times[0].toFixed(2)} ms in frame 1, ${names[order[1]]} ${times[1].toFixed(2)} ms in frame 2`);
    }
    if (everyOperation)
    {
        for (const frame of BOTH)
        {
            if (await rowCount(frames[frame]) !== 0)
            {
                throw new Error(`the ${names[order[frame]]} page kept rows after clear`);
            }
        }
    }
    checkPage(tab);
}

/**
 * Times every operation, or the named ones, on two benchmark pages served
 * from `origin`, `iterations` times each in each of two pair pages: the
 * pages side by side in one tab, so they share its renderer process and
 * meet the same load wherever the system runs it, then in a new tab with a
 * process of its own and the pages in each other's frames. A page's time is
 * the geometric mean of its median in each frame, so a frame's own speed
 * divides out of the ratio between the pages. Each operation runs under its
 * CPU slowdown, with garbage collected before every sample, which needs
 * Chromium launched with `--js-flags=--expose-gc`.
 */
export async function measurePair(browser: Browser, origin: string, names: readonly [string, string], iterations: number, only?: ReadonlySet<string>): Promise<PairedTime[]>
{
    const results = operations.filter((one) => only === undefined || only.has(one.name)).map((operation): Medians => ({ operation, medians: [[], []] }));
    for (const order of ORDERS)
    {
        const tab = await browser.newPage();
        try
        {
            await sampleOrder(tab, origin, names, order, results, iterations, only === undefined);
        }
        finally
        {
            await tab.context().close();
        }
    }
    return results.map(({ operation, medians }) => ({
        operation,
        times: [Math.sqrt((medians[0][0] ?? 0) * (medians[0][1] ?? 0)), Math.sqrt((medians[1][0] ?? 0) * (medians[1][1] ?? 0))]
    }));
}
