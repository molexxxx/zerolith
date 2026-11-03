/**
 * Writes one js-framework-benchmark run into `benchmarks/results/` from the
 * benchmark's own result files, for every framework `frameworks.json`
 * lists: each timed operation's median duration and each memory, size, and
 * first paint result.
 *   node benchmarks/collect.ts <webdriver-ts/results> --date <YYYY-MM-DD> --zerolith <version> --method <text> --machine <text> [--note <text>] [--previous <version>] [--again <results>]... [--out <file>]
 * An entry's files are named for its folder and the version it ran; an
 * entry with files of several versions is refused, except zerolith, whose
 * version `--zerolith` names. `--previous` names zerolith's release before,
 * measured in the same run from the folder `zerolith-previous`, which the
 * run keeps as `previous`. Each `--again` names the results folder of one
 * more pass of the memory, size, and first paint benchmarks, which the
 * benchmark samples once a pass, and each of those results is the median
 * over every pass. `--out` writes the run to that file instead, as
 * the benchmarks workflow does before `npm run bench:report -- --add` takes
 * it into the folder.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { type FrameworkResult, MEASURES, OPERATIONS, type Run } from "./results.ts";

interface Frameworks
{
    commit: string;
    frameworks: { name: string; entry: string }[];
}

interface ResultFile
{
    values: Record<string, { values: number[]; median: number }>;
}

const { positionals, values: flags } = parseArgs({
    allowPositionals: true,
    options: {
        date: { type: "string" },
        zerolith: { type: "string" },
        method: { type: "string" },
        machine: { type: "string" },
        note: { type: "string" },
        previous: { type: "string" },
        again: { type: "string", multiple: true },
        out: { type: "string" }
    },
    strict: true
});
const [folder] = positionals;
const { date, zerolith, method, machine, note, previous, out } = flags;
const passes = flags.again ?? [];
if (folder === undefined || date === undefined || zerolith === undefined || method === undefined || machine === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date))
{
    throw new Error("usage: node benchmarks/collect.ts <webdriver-ts/results> --date <YYYY-MM-DD> --zerolith <version> --method <text> --machine <text> [--note <text>] [--previous <version>] [--again <results>]... [--out <file>]");
}

const here = fileURLToPath(new URL("./", import.meta.url));
const listed = JSON.parse(await readFile(join(here, "frameworks.json"), "utf8")) as Frameworks;
const files = await readdir(folder);

function median(samples: readonly number[]): number
{
    const sorted = samples.toSorted((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[middle] ?? 0 : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** The name the benchmark gives an entry's results, `<entry>-v<version>-keyed` or `<entry>-keyed`, and the version in it, which `version` picks when given. */
function resultName(entry: string, version?: string): { name: string; version: string }
{
    const pattern = new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:-v(\\d[^_]*))?-keyed_${OPERATIONS[0]?.id}\\.json$`);
    const found = files.map((file) => pattern.exec(file)).filter((match) => match !== null).map((match) => ({ name: match[0].slice(0, -`_${OPERATIONS[0]?.id}.json`.length), version: match[1] ?? "hand-written" }));
    const chosen = version === undefined ? found : found.filter((one) => one.version === version);
    if (chosen.length !== 1)
    {
        throw new Error(`${entry}: expected the results of one version in ${folder}, found ${found.map((one) => one.version).join(", ") || "none"}`);
    }
    return chosen[0] as { name: string; version: string };
}

async function read(name: string, benchmark: string, from: string = folder as string): Promise<ResultFile>
{
    return JSON.parse(await readFile(join(from, `${name}_${benchmark}.json`), "utf8")) as ResultFile;
}

/** One entry's results in the run, read from the files of the folder `folderName`. */
async function measured(name: string, entry: string, folderName: string, version?: string): Promise<FrameworkResult>
{
    const result = resultName(folderName, version);
    const operations: Record<string, number> = {};
    for (const operation of OPERATIONS)
    {
        const total = (await read(result.name, operation.id)).values["total"];
        if (total === undefined || total.values.length === 0)
        {
            throw new Error(`${result.name}: ${operation.id} holds no total durations`);
        }
        operations[operation.id] = median(total.values);
    }
    const measures: Record<string, number> = {};
    for (const measure of MEASURES)
    {
        const samples: number[] = [];
        for (const from of [folder as string, ...passes])
        {
            const value = (await read(result.name, measure.id, from)).values["DEFAULT"]?.median;
            if (value === undefined)
            {
                throw new Error(`${result.name}: ${measure.id} holds no result in ${from}`);
            }
            samples.push(value);
        }
        measures[measure.id] = median(samples);
    }
    return { name, entry, version: result.version, operations, measures };
}

const frameworks = await Promise.all(listed.frameworks.map(({ name, entry }) => measured(name, entry, entry, entry === "zerolith" ? zerolith : undefined)));
const before = previous === undefined ? undefined : await measured("zerolith", "zerolith", "zerolith-previous", previous);
const run: Run = { date, zerolith, commit: listed.commit.slice(0, 7), statistic: "median", method, machine, ...(note === undefined ? {} : { note }), ...(passes.length === 0 ? {} : { passes: passes.length + 1 }), frameworks, ...(before === undefined ? {} : { previous: before }) };
const target = out ?? join(here, "results", `${date}-${zerolith}.json`);
await writeFile(target, `${JSON.stringify(run, null, 4)}\n`);
console.log(`wrote ${target}`);
