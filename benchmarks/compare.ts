/**
 * Measures what a change does to rendering speed against the core built at
 * a base commit. Both builds load in one headless Chromium, each in its own
 * tab, and every iteration of every operation runs on both in alternating
 * order, so the two meet the same load and drift cancels. The small
 * operations run under the CPU slowdowns js-framework-benchmark uses, so
 * they take long enough to time, and garbage is collected before every
 * sample, on both builds alike, so a collection one sample causes does not
 * land in the next.
 *
 * Each operation's factor is the change's median time over the base's; the
 * geometric mean of the factors is the change's overall factor. A pass is
 * beyond its thresholds when the overall factor is more than the threshold
 * above 1, or one operation's is more than the operation threshold above 1,
 * so a large slowdown in one operation cannot hide in the mean. Such a pass
 * is confirmed with fresh samples, of every operation when the overall
 * factor crossed and of the crossing operations otherwise, and the change
 * fails only when the confirming pass crosses too, so one noisy pass cannot
 * fail it.
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
import { type CDPSession, type Page, chromium } from "playwright";
import { percentage, wholeNumber } from "../scripts/options.ts";
import { checkPage, median, open, operations, rowCount, sample, serve } from "./harness.ts";

/** Each build's samples of one operation, in milliseconds. */
interface Samples
{
    base: number[];
    head: number[];
}

/** One operation's result in a pass: the median of each build and the change's factor. */
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

/** Samples each operation `iterations` times on both builds, alternating which goes first: every operation, or the named ones. */
async function measure(tabs: Record<Build, Page>, sessions: Record<Build, CDPSession>, only?: ReadonlySet<string>): Promise<Row[]>
{
    const rows: Row[] = [];
    for (const operation of operations.filter((one) => only === undefined || only.has(one.name)))
    {
        await sessions.base.send("Emulation.setCPUThrottlingRate", { rate: operation.slowdown });
        await sessions.head.send("Emulation.setCPUThrottlingRate", { rate: operation.slowdown });
        const samples: Samples = { base: [], head: [] };
        for (let i = 0; i < iterations; i++)
        {
            for (const which of i % 2 === 0 ? (["base", "head"] as const) : (["head", "base"] as const))
            {
                await tabs[which].bringToFront();
                samples[which].push(await sample(tabs[which], operation.name, true));
            }
        }
        const before = median(samples.base);
        const after = median(samples.head);
        console.log(`${operation.label}: ${before.toFixed(2)} ms before, ${after.toFixed(2)} ms after`);
        rows.push({ name: operation.name, label: operation.label, slowdown: operation.slowdown, before, after, factor: before > 0 ? after / before : 1, measured: before >= MEASURABLE_MS });
    }
    return rows;
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
    const tabs = { base: await browser.newPage(), head: await browser.newPage() };
    await open(tabs.base, `${server.origin}/bench/base`);
    await open(tabs.head, `${server.origin}/bench/head`);
    const sessions = { base: await tabs.base.context().newCDPSession(tabs.base), head: await tabs.head.context().newCDPSession(tabs.head) };
    const method = `paired samples per operation in one browser, milliseconds of script plus forced style and layout, with js-framework-benchmark's CPU slowdowns. Lower is faster.`;

    const rows = await measure(tabs, sessions);
    for (const which of ["base", "head"] as const)
    {
        if (await rowCount(tabs[which]) !== 0)
        {
            throw new Error(`the ${which} page kept rows after clear`);
        }
    }
    const overall = overallOf(rows);
    const reports = [table(`Median of ${iterations} ${method}`, rows, overall, commit)];
    const failures: string[] = [];
    const all = crossesOverall(overall);
    const crossedFirst = new Set(crossing(rows).map((row) => row.name));
    if (all || crossedFirst.size > 0)
    {
        console.log(`Beyond a threshold; confirming with fresh samples of ${all ? "every operation" : [...crossedFirst].join(", ")}.`);
        const confirming = await measure(tabs, sessions, all ? undefined : crossedFirst);
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
    checkPage(tabs.base);
    checkPage(tabs.head);

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
