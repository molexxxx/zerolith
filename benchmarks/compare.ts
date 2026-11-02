/**
 * Measures what a change does to rendering speed against the core built at
 * a base commit. Both builds load side by side in one page of a headless
 * Chromium, each in its own frame, so they share one renderer process and
 * meet the same load wherever the system runs it: a process can take 40%
 * longer on some of a processor's cores than on others, so two builds in
 * two processes measure where each was placed as much as the change. Every
 * iteration of every operation runs in both frames in alternating order,
 * so drift cancels. Halfway the builds trade frames, as one frame can run
 * some operations steadily faster than the other, and the second half runs
 * in a new page with a renderer process of its own: in a page loaded after
 * another in the same process, one frame ran an operation up to 21% slower.
 * The small
 * operations run under the CPU slowdowns js-framework-benchmark uses, so
 * they take long enough to time, and garbage is collected before every
 * sample, on both builds alike, so a collection one sample causes does not
 * land in the next.
 *
 * A build's time for an operation is the geometric mean of its median in
 * each frame, so a frame's own speed divides out of the operation's factor,
 * the change's time over the base's; the geometric mean of the factors is
 * the change's overall factor. A pass is beyond its thresholds when the
 * overall factor is more than the threshold above 1, or one operation's is
 * more than the operation threshold above 1, so a large slowdown in one
 * operation cannot hide in the mean. Such a pass is confirmed with fresh
 * samples, of every operation when the overall factor crossed and of the
 * crossing operations otherwise, and the change fails only when the
 * confirming pass crosses too, so one noisy pass cannot fail it.
 *   node benchmarks/compare.ts [--base <commit>] [--iterations <n>] [--threshold <percent>] [--operation-threshold <percent>]
 * The base is HEAD unless named, so before a commit it measures the
 * uncommitted change; `--base baseline` reads the commit from
 * `benchmarks/baseline`, as CI does. The base is built in a temporary
 * worktree and kept under ZEROLITH_BENCH_CACHE, a folder in the temporary
 * folder by default, which holds the builds of the eight commits used last,
 * so a later run against the same commit skips the build. Build the working
 * tree first with `npm run build`. In GitHub Actions the tables also go to
 * the job summary.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, cp, mkdtemp, readFile, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { type Browser, type Page, chromium } from "playwright";
import { percentage, wholeNumber } from "../scripts/options.ts";
import { type Operation, checkPage, median, openPair, operations, rowCount, sample, serve } from "./harness.ts";

/** One operation's medians in a pass, each build's in each frame it ran in, in milliseconds. */
interface Medians
{
    operation: Operation;
    base: number[];
    head: number[];
}

/** One operation's result in a pass: each build's time, the geometric mean of its medians, and the change's factor. */
interface Row
{
    name: string;
    label: string;
    slowdown: number;
    before: number;
    after: number;
    factor: number;
    measured: boolean;
}

type Build = "base" | "head";

/** Both frames of the pair page, by position. */
const BOTH = [0, 1] as const;

/** Which build each frame holds, in turn: the builds trade frames, so each is sampled in both. */
const ARRANGEMENTS: readonly (readonly [Build, Build])[] = [["base", "head"], ["head", "base"]];

const root = fileURLToPath(new URL("../", import.meta.url));
const { values: flags } = parseArgs({
    options: {
        "base": { type: "string", default: "HEAD" },
        "iterations": { type: "string", default: "15" },
        "threshold": { type: "string", default: "5" },
        "operation-threshold": { type: "string", default: "15" }
    },
    strict: true
});
const base = flags.base === "baseline" ? (await readFile(join(root, "benchmarks", "baseline"), "utf8")).trim() : flags.base;
const iterations = wholeNumber("--iterations", flags.iterations);
const threshold = percentage("--threshold", flags.threshold);
const operationThreshold = percentage("--operation-threshold", flags["operation-threshold"]);
const cache = process.env["ZEROLITH_BENCH_CACHE"] || join(tmpdir(), "zerolith-bench-cache");
/** How many commits' builds the cache keeps, the ones used last. */
const CACHE_ENTRIES = 8;
const npmCli = process.env["npm_execpath"];
/** Below this many milliseconds a sample is mostly timer resolution, so the operation is shown but left out of the overall factor. */
const MEASURABLE_MS = 1;

/** Runs a command to completion with its output shown, and throws when it fails. */
function run(command: string, commandArgs: string[], cwd: string): void
{
    const viaNpm = command === "npm" && npmCli !== undefined;
    const result = spawnSync(viaNpm ? process.execPath : command, viaNpm ? [npmCli, ...commandArgs] : commandArgs, { cwd, stdio: ["ignore", "inherit", "inherit"], shell: command === "npm" && !viaNpm && process.platform === "win32" });
    if (result.status !== 0)
    {
        throw new Error(`${command} ${commandArgs.join(" ")} failed in ${cwd}`);
    }
}

function factorText(factor: number): string
{
    const change = (factor - 1) * 100;
    return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

/** Keeps the cache to the builds used last, and removes the copies interrupted runs left once they are an hour old. */
async function prune(): Promise<void>
{
    const entries = await readdir(cache, { withFileTypes: true });
    const dated = (await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) =>
    {
        const time = await stat(join(cache, entry.name)).then((stats) => stats.mtimeMs, () => undefined);
        return time === undefined ? undefined : { name: entry.name, path: join(cache, entry.name), time };
    }))).filter((entry) => entry !== undefined);
    const builds = dated.filter((entry) => /^[0-9a-f]{40}$/.test(entry.name));
    const leftovers = dated.filter((entry) => /^[0-9a-f]{40}\.\d+\.partial$/.test(entry.name) && Date.now() - entry.time > 3600000);
    for (const stale of [...builds.toSorted((a, b) => b.time - a.time).slice(CACHE_ENTRIES), ...leftovers])
    {
        await rm(stale.path, { recursive: true, force: true });
    }
}

/**
 * The core's production build at a commit: the cached one when an earlier
 * run built it, otherwise built in a temporary worktree and moved into the
 * cache in one rename, so no run reads a half-written build, and a build
 * another run finished first is kept as it is.
 */
async function baseBuild(sha: string): Promise<string>
{
    const cached = join(cache, sha);
    if (existsSync(join(cached, "index.js")))
    {
        console.log(`using the core built at ${sha.slice(0, 7)} from ${cached}`);
        const now = new Date();
        await utimes(cached, now, now);
        return cached;
    }
    const worktree = await mkdtemp(join(tmpdir(), "zerolith-bench-base-"));
    try
    {
        console.log(`building the core at ${sha.slice(0, 7)} in ${worktree}`);
        run("git", ["worktree", "add", "--detach", worktree, sha], root);
        run("npm", ["ci", "--no-audit", "--no-fund"], worktree);
        run("npm", ["run", "build", "--workspace", "zerolith"], worktree);
        const partial = `${cached}.${process.pid}.partial`;
        await rm(partial, { recursive: true, force: true });
        await cp(join(worktree, "packages", "zerolith", "dist", "production"), partial, { recursive: true });
        if (existsSync(cached) && !existsSync(join(cached, "index.js")))
        {
            await rm(cached, { recursive: true, force: true });
        }
        try
        {
            await rename(partial, cached);
        }
        catch (error)
        {
            await rm(partial, { recursive: true, force: true });
            if (!existsSync(join(cached, "index.js")))
            {
                throw error;
            }
        }
        await prune();
        return cached;
    }
    finally
    {
        spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: root });
        await rm(worktree, { recursive: true, force: true });
    }
}

/**
 * Samples each chosen operation `iterations` times on both builds, each in
 * the frame the arrangement gives it, alternating which frame goes first,
 * and adds each build's median to its results; when every operation ran,
 * the last of them clear, checks that both pages hold no rows.
 */
async function sampleArrangement(origin: string, tab: Page, arrangement: readonly [Build, Build], results: readonly Medians[], everyOperation: boolean): Promise<void>
{
    const session = await tab.context().newCDPSession(tab);
    const frames = await openPair(tab, origin, arrangement);
    for (const result of results)
    {
        await session.send("Emulation.setCPUThrottlingRate", { rate: result.operation.slowdown });
        const samples: [number[], number[]] = [[], []];
        for (let i = 0; i < iterations; i++)
        {
            for (const index of i % 2 === 0 ? BOTH : [1, 0] as const)
            {
                samples[index].push(await sample(frames[index], result.operation.name, true));
            }
        }
        const times = [median(samples[0]), median(samples[1])] as const;
        for (const index of BOTH)
        {
            result[arrangement[index]].push(times[index]);
        }
        console.log(`${result.operation.label}: ${arrangement[0]} ${times[0].toFixed(2)} ms in frame 1, ${arrangement[1]} ${times[1].toFixed(2)} ms in frame 2`);
    }
    for (const index of everyOperation ? BOTH : [])
    {
        if (await rowCount(frames[index]) !== 0)
        {
            throw new Error(`the ${arrangement[index]} page kept rows after clear`);
        }
    }
    checkPage(tab);
}

/**
 * Samples each operation `iterations` times on both builds in each
 * arrangement: every operation, or the named ones. Each arrangement runs in
 * a page of its own, with a renderer process of its own, so the two start
 * alike. A build's time is the geometric mean of its medians in the two
 * frames, so a frame that runs faster than the other speeds both builds by
 * the same factor and the change's factor keeps none of it.
 */
async function measure(origin: string, browser: Browser, only?: ReadonlySet<string>): Promise<Row[]>
{
    const results = operations.filter((one) => only === undefined || only.has(one.name)).map((operation): Medians => ({ operation, base: [], head: [] }));
    for (const arrangement of ARRANGEMENTS)
    {
        const tab = await browser.newPage();
        try
        {
            await sampleArrangement(origin, tab, arrangement, results, only === undefined);
        }
        finally
        {
            await tab.context().close();
        }
    }
    return results.map((result) =>
    {
        const { operation } = result;
        const before = Math.sqrt((result.base[0] ?? 0) * (result.base[1] ?? 0));
        const after = Math.sqrt((result.head[0] ?? 0) * (result.head[1] ?? 0));
        return { name: operation.name, label: operation.label, slowdown: operation.slowdown, before, after, factor: before > 0 ? after / before : 1, measured: before >= MEASURABLE_MS };
    });
}

function overallOf(rows: readonly Row[]): number
{
    const counted = rows.filter((row) => row.measured);
    return Math.pow(counted.reduce((product, row) => product * row.factor, 1), 1 / Math.max(1, counted.length));
}

function crossesOverall(overall: number): boolean
{
    return (overall - 1) * 100 > threshold;
}

function crossing(rows: readonly Row[]): Row[]
{
    return rows.filter((row) => row.measured && (row.factor - 1) * 100 > operationThreshold);
}

function table(title: string, rows: readonly Row[], overall: number | undefined, commit: string): string
{
    return [
        title,
        "",
        `| Operation | Slowdown | ${commit} | Change | Difference |`,
        "| --- | --- | --- | --- | --- |",
        ...rows.map((row) => `| ${row.label} | ${row.slowdown}x | ${row.before.toFixed(2)} | ${row.after.toFixed(2)} | ${row.measured ? factorText(row.factor) : "too fast to time"} |`),
        ...(overall === undefined ? [] : [`| geometric mean | | | | ${factorText(overall)} |`])
    ].join("\n");
}

const sha = spawnSync("git", ["rev-parse", `${base}^{commit}`], { cwd: root, encoding: "utf8" }).stdout.trim();
if (sha === "")
{
    throw new Error(`${base} names no commit`);
}
const commit = sha.slice(0, 7);
const baseDist = await baseBuild(sha);
const server = await serve(
    { base: { script: "zerolith", core: "base" }, head: { script: "zerolith", core: "head" } },
    { base: baseDist, head: join(root, "packages", "zerolith", "dist", "production") }
);
const browser = await chromium.launch({ args: ["--js-flags=--expose-gc"] });
try
{
    const method = `paired samples per operation in each frame of a page that holds both builds side by side, then in a new page with the builds in each other's frames, combined by geometric mean; milliseconds of script plus forced style and layout, with js-framework-benchmark's CPU slowdowns. Lower is faster.`;

    const rows = await measure(server.origin, browser);
    const overall = overallOf(rows);
    const reports = [table(`Median of ${iterations} ${method}`, rows, overall, commit)];
    const failures: string[] = [];
    const all = crossesOverall(overall);
    const crossedFirst = new Set(crossing(rows).map((row) => row.name));
    if (all || crossedFirst.size > 0)
    {
        console.log(`Beyond a threshold; confirming with fresh samples of ${all ? "every operation" : [...crossedFirst].join(", ")}.`);
        const confirming = await measure(server.origin, browser, all ? undefined : crossedFirst);
        const confirmingOverall = overallOf(confirming);
        reports.push(table(`Confirming pass: median of ${iterations} fresh ${method}`, confirming, all ? confirmingOverall : undefined, commit));
        if (all && crossesOverall(confirmingOverall))
        {
            failures.push(`The change is ${factorText(confirmingOverall)} against ${commit} in both passes, beyond the ${threshold}% threshold.`);
        }
        for (const row of crossing(confirming).filter((one) => crossedFirst.has(one.name)))
        {
            failures.push(`${row.label} is ${factorText(row.factor)} against ${commit} in both passes, beyond the ${operationThreshold}% threshold for one operation.`);
        }
    }

    console.log(`\n${reports.join("\n\n")}\n`);
    const summary = process.env["GITHUB_STEP_SUMMARY"];
    if (summary !== undefined && summary !== "")
    {
        await appendFile(summary, `## Benchmark against ${commit} (${base})\n\n${reports.join("\n\n")}\n`);
    }
    for (const failure of failures)
    {
        console.log(failure);
        process.exitCode = 1;
    }
}
finally
{
    await browser.close();
    server.close();
}
