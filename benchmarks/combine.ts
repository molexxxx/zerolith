/**
 * Combines runs of one release, each taken in its own session on its own
 * machine, into one run: each framework's operation and measure is the
 * median of its result in each session, so one machine's speed or one
 * noisy session moves the published result less than it moves its own.
 * The benchmarks workflow measures each release in three sessions on
 * separate GitHub-hosted runners and combines them before it commits.
 *   node benchmarks/combine.ts <run.json> <run.json>... --out <file>
 */
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { type FrameworkResult, type Run, checkRun } from "./results.ts";

const { values: flags, positionals: files } = parseArgs({
    allowPositionals: true,
    options: { out: { type: "string" } },
    strict: true
});
if (files.length < 2 || flags.out === undefined)
{
    throw new Error("usage: node benchmarks/combine.ts <run.json> <run.json>... --out <file>");
}

function median(samples: readonly number[]): number
{
    const sorted = samples.toSorted((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] ?? 0 : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** The medians, key by key, of the records each session holds for one result. */
function medians(records: readonly (Record<string, number> | undefined)[], where: string): Record<string, number>
{
    const first = records[0] ?? {};
    const result: Record<string, number> = {};
    for (const key of Object.keys(first))
    {
        const samples = records.map((record) => record?.[key]);
        if (samples.some((sample) => sample === undefined))
        {
            throw new Error(`${where}: ${key} is missing from a session`);
        }
        result[key] = median(samples as number[]);
    }
    return result;
}

/** One framework's results combined over the sessions, matched by name. */
function combined(results: readonly (FrameworkResult | undefined)[], where: string): FrameworkResult
{
    const [first] = results;
    if (first === undefined || results.some((result) => result === undefined || result.version !== first.version || result.entry !== first.entry))
    {
        throw new Error(`${where}: the sessions did not measure the same entry and version`);
    }
    return {
        name: first.name,
        entry: first.entry,
        version: first.version,
        ...(first.operations === undefined ? {} : { operations: medians(results.map((result) => result?.operations), `${where}.operations`) }),
        ...(first.measures === undefined ? {} : { measures: medians(results.map((result) => result?.measures), `${where}.measures`) })
    };
}

const runs = await Promise.all(files.map(async (file) => checkRun(JSON.parse(await readFile(file, "utf8")), file)));
const [first] = runs as [Run, ...Run[]];
for (const run of runs)
{
    if (run.zerolith !== first.zerolith || run.commit !== first.commit || run.frameworks.length !== first.frameworks.length || (run.previous === undefined) !== (first.previous === undefined))
    {
        throw new Error("the sessions measured different releases, benchmark commits, or framework lists");
    }
}
const cpus = [...new Set(runs.map((one) => (one.machine.split(",")[0] ?? "").trim().replace(/ Processor$/, "")))];
const rest = first.machine.split(",").slice(1).join(",").trim();
const run: Run = {
    date: runs.map((one) => one.date).toSorted().at(-1) as string,
    zerolith: first.zerolith,
    commit: first.commit,
    statistic: "median",
    method: `the median of ${runs.length} sessions on separate GitHub-hosted runners, each with ${first.method.replace(/ on a GitHub-hosted runner$/, "")}`,
    machine: `${cpus.join("; ")}, ${rest}`,
    ...(first.note === undefined ? {} : { note: first.note }),
    ...(first.passes === undefined ? {} : { passes: first.passes }),
    frameworks: first.frameworks.map((framework) => combined(runs.map((one) => one.frameworks.find((other) => other.name === framework.name)), framework.name)),
    ...(first.previous === undefined ? {} : { previous: combined(runs.map((one) => one.previous), "previous") })
};
checkRun(run, flags.out);
await writeFile(flags.out, `${JSON.stringify(run, null, 4)}\n`);
console.log(`combined ${runs.length} sessions of zerolith ${run.zerolith} into ${flags.out}`);
