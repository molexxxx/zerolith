/**
 * Writes the results section of `benchmarks/README.md` from the runs in
 * `benchmarks/results/`. With `--add <file>`, it first adds a run collected
 * elsewhere: the file is checked field by field, as every run is, its
 * frameworks must be the ones `frameworks.json` lists, and it is written
 * as `results/<date>-<version>.json` from what it holds, never under a name
 * it brings, and never over a run already kept. With `--pin <version>`, it
 * also moves what names the measured release, unless the entry pins a
 * later one: the js-framework-benchmark entry's two pins and the sentences
 * in the roadmap and the entry's README that state the pin, and `baseline`
 * when it names an earlier release or a commit the release's tag holds in
 * git's history. Given both, the run must be of the pinned version. Every check runs before any file is
 * written. With `--check`, alone, it exits with 1 when the README's section
 * is not what the runs render, changing nothing.
 *   node benchmarks/report.ts [--add <file>] [--pin <version>] [--check]
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { checkRun, pinRelease, readRuns, renderResults, replaceSection } from "./results.ts";

const { values: flags } = parseArgs({ options: { add: { type: "string" }, pin: { type: "string" }, check: { type: "boolean", default: false } }, strict: true });
const folder = fileURLToPath(new URL("./results/", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));

/** Whether the commit is in the history of the tag, as git answers it in the repository. */
function contains(commit: string, tag: string): boolean
{
    const result = spawnSync("git", ["merge-base", "--is-ancestor", commit, tag], { cwd: root, encoding: "utf8" });
    if (result.status === 0 || result.status === 1)
    {
        return result.status === 0;
    }
    throw new Error(`git merge-base --is-ancestor ${commit} ${tag} failed: ${result.error?.message ?? result.stderr.trim()}`);
}

if (flags.check && (flags.add !== undefined || flags.pin !== undefined))
{
    throw new Error("--check changes nothing, so it takes neither --add nor --pin");
}

let added: { text: string; target: string } | undefined;
if (flags.add !== undefined)
{
    const run = checkRun(JSON.parse(await readFile(flags.add, "utf8")), flags.add);
    if (flags.pin !== undefined && run.zerolith !== flags.pin)
    {
        throw new Error(`${flags.add} measured ${run.zerolith}, not ${flags.pin}`);
    }
    const listed = JSON.parse(await readFile(new URL("./frameworks.json", import.meta.url), "utf8")) as { frameworks: { name: string; entry: string }[] };
    const expected = listed.frameworks.map(({ name, entry }) => `${name} (${entry})`).toSorted().join(", ");
    const measured = run.frameworks.map(({ name, entry }) => `${name} (${entry})`).toSorted().join(", ");
    if (measured !== expected)
    {
        throw new Error(`${flags.add} measured ${measured}, not the frameworks frameworks.json lists: ${expected}`);
    }
    const target = join(folder, `${run.date}-${run.zerolith}.json`);
    if (existsSync(target))
    {
        throw new Error(`${target} already holds a run; a run is never replaced`);
    }
    added = { text: `${JSON.stringify(run, null, 4)}\n`, target };
}

if (flags.pin !== undefined)
{
    const moved = await pinRelease(flags.pin, root, contains);
    if (!moved.entry)
    {
        console.log(`left the pin, which names a later release than ${flags.pin}`);
    }
    else
    {
        console.log(moved.baseline ? `pinned the entry and the baseline to ${flags.pin}` : `pinned the entry to ${flags.pin}; the baseline names a commit the release does not hold, and stays`);
    }
}

if (added !== undefined)
{
    await writeFile(added.target, added.text);
    console.log(`added ${added.target}`);
}

const readmePath = fileURLToPath(new URL("./README.md", import.meta.url));
const readme = await readFile(readmePath, "utf8");
const rendered = replaceSection(readme, renderResults(await readRuns(folder)));
if (flags.check)
{
    if (rendered !== readme)
    {
        console.log("benchmarks/README.md is behind benchmarks/results/; run npm run bench:report");
        process.exitCode = 1;
    }
}
else if (rendered !== readme)
{
    await writeFile(readmePath, rendered);
    console.log("wrote the results section of benchmarks/README.md");
}
