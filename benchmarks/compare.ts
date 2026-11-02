/**
 * Measures what a change does to rendering speed against the core built at
 * a base commit. The base is built in a temporary worktree; then both builds
 * load in one headless Chromium, each in its own tab, and every iteration of
 * every operation runs on both in alternating order, so the two meet the
 * same load and drift cancels. The small operations run under the CPU
 * slowdowns js-framework-benchmark uses, so they take long enough to time,
 * and garbage is collected before every sample, on both builds alike, so a
 * collection one sample causes does not land in the next.
 * Each operation's factor is the change's median time over the base's; the
 * geometric mean of the factors is the change's overall factor. The run
 * fails when the overall factor is more than the threshold above 1, or one
 * operation's is more than the operation threshold above 1, so a large
 * slowdown in one operation cannot hide in the mean.
 *   node benchmarks/compare.ts [--base <commit>] [--iterations <n>] [--threshold <percent>] [--operation-threshold <percent>]
 * The base is HEAD unless named, so before a commit it measures the
 * uncommitted change; `--base baseline` reads the commit from
 * `benchmarks/baseline`, as CI does. Build the working tree first with
 * `npm run build`. In GitHub Actions the table also goes to the job summary.
 */
import { spawnSync } from "node:child_process";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { median, open, operations, rowCount, sample, serve } from "./harness.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);

function option(name: string, fallback: string): string
{
    const at = args.indexOf(name);
    return at === -1 ? fallback : args[at + 1] ?? fallback;
}

const requested = option("--base", "HEAD");
const base = requested === "baseline" ? (await readFile(join(root, "benchmarks", "baseline"), "utf8")).trim() : requested;
const iterations = Number(option("--iterations", "15"));
const threshold = Number(option("--threshold", "5"));
const operationThreshold = Number(option("--operation-threshold", "15"));
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

const commit = spawnSync("git", ["rev-parse", "--short", `${base}^{commit}`], { cwd: root, encoding: "utf8" }).stdout.trim();
if (commit === "")
{
    throw new Error(`${base} names no commit`);
}
const worktree = await mkdtemp(join(tmpdir(), "zerolith-bench-base-"));
try
{
    console.log(`building the core at ${commit} (${base}) in ${worktree}`);
    run("git", ["worktree", "add", "--detach", worktree, commit], root);
    run("npm", ["ci", "--no-audit", "--no-fund"], worktree);
    run("npm", ["run", "build", "--workspace", "zerolith"], worktree);

    const server = await serve(
        { base: { script: "zerolith", core: "base" }, head: { script: "zerolith", core: "head" } },
        { base: join(worktree, "packages", "zerolith", "dist", "production"), head: join(root, "packages", "zerolith", "dist", "production") }
    );
    const browser = await chromium.launch({ args: ["--js-flags=--expose-gc"] });
    const tabs = { base: await browser.newPage(), head: await browser.newPage() };
    await open(tabs.base, `${server.origin}/bench/base`);
    await open(tabs.head, `${server.origin}/bench/head`);
    const sessions = { base: await tabs.base.context().newCDPSession(tabs.base), head: await tabs.head.context().newCDPSession(tabs.head) };

    const rows: { label: string; before: number; after: number; factor: number; measured: boolean }[] = [];
    for (const operation of operations)
    {
        await sessions.base.send("Emulation.setCPUThrottlingRate", { rate: operation.slowdown });
        await sessions.head.send("Emulation.setCPUThrottlingRate", { rate: operation.slowdown });
        const times = { base: [] as number[], head: [] as number[] };
        for (let i = 0; i < iterations; i++)
        {
            for (const which of i % 2 === 0 ? (["base", "head"] as const) : (["head", "base"] as const))
            {
                await tabs[which].bringToFront();
                times[which].push(await sample(tabs[which], operation.name, true));
            }
        }
        const before = median(times.base);
        const after = median(times.head);
        rows.push({ label: operation.label, before, after, factor: before > 0 ? after / before : 1, measured: before >= MEASURABLE_MS });
        console.log(`${operation.label}: ${before.toFixed(2)} ms at ${commit}, ${after.toFixed(2)} ms with the change`);
    }
    for (const which of ["base", "head"] as const)
    {
        if (await rowCount(tabs[which]) !== 0)
        {
            throw new Error(`the ${which} page kept rows after clear`);
        }
    }
    await browser.close();
    server.close();

    const counted = rows.filter((row) => row.measured);
    const overall = Math.pow(counted.reduce((product, row) => product * row.factor, 1), 1 / Math.max(1, counted.length));
    const table = [
        `Median of ${iterations} paired samples per operation in one browser, milliseconds of script plus forced style and layout, with js-framework-benchmark's CPU slowdowns. Lower is faster.`,
        "",
        `| Operation | Slowdown | ${commit} | Change | Difference |`,
        "| --- | --- | --- | --- | --- |",
        ...rows.map((row, index) => `| ${row.label} | ${operations[index]?.slowdown ?? 1}x | ${row.before.toFixed(2)} | ${row.after.toFixed(2)} | ${row.measured ? factorText(row.factor) : "too fast to time"} |`),
        `| geometric mean | | | | ${factorText(overall)} |`
    ].join("\n");
    console.log(`\n${table}\n`);
    const summary = process.env["GITHUB_STEP_SUMMARY"];
    if (summary !== undefined && summary !== "")
    {
        await appendFile(summary, `## Benchmark against ${commit} (${base})\n\n${table}\n`);
    }
    if ((overall - 1) * 100 > threshold)
    {
        console.log(`The change is ${factorText(overall)} against ${commit}, beyond the ${threshold}% threshold.`);
        process.exitCode = 1;
    }
    for (const row of counted.filter((one) => (one.factor - 1) * 100 > operationThreshold))
    {
        console.log(`${row.label} is ${factorText(row.factor)} against ${commit}, beyond the ${operationThreshold}% threshold for one operation.`);
        process.exitCode = 1;
    }
}
finally
{
    spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: root });
    await rm(worktree, { recursive: true, force: true });
}
