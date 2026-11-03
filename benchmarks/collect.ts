/**
 * Writes one js-framework-benchmark run into `benchmarks/results/` from the
 * benchmark's own result files, for every framework `frameworks.json`
 * lists: each timed operation's median duration and each memory, size, and
 * first paint result.
 *   node benchmarks/collect.ts <webdriver-ts/results> --date <YYYY-MM-DD> --zerolith <version> --method <text> --machine <text> [--note <text>] [--out <file>]
 * An entry's files are named for its folder and the version it ran; an
 * entry with files of several versions is refused, except zerolith, whose
 * version `--zerolith` names. `--out` writes the run to that file instead,
 * as the benchmarks workflow does before `npm run bench:report -- --add`
 * takes it into the folder.
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
        out: { type: "string" }
    },
    strict: true
});
const [folder] = positionals;
const { date, zerolith, method, machine, note, out } = flags;
if (folder === undefined || date === undefined || zerolith === undefined || method === undefined || machine === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(date))
{
    throw new Error("usage: node benchmarks/collect.ts <webdriver-ts/results> --date <YYYY-MM-DD> --zerolith <version> --method <text> --machine <text> [--note <text>] [--out <file>]");
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

/** The name the benchmark gives an entry's results, `<entry>-v<version>-keyed` or `<entry>-keyed`, and the version in it. */
function resultName(entry: string): { name: string; version: string }
{
    const pattern = new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:-v(\\d[^_]*))?-keyed_${OPERATIONS[0]?.id}\\.json$`);
    const found = files.map((file) => pattern.exec(file)).filter((match) => match !== null).map((match) => ({ name: match[0].slice(0, -`_${OPERATIONS[0]?.id}.json`.length), version: match[1] ?? "hand-written" }));
    const chosen = entry === "zerolith" ? found.filter((one) => one.version === zerolith) : found;
    if (chosen.length !== 1)
    {
        throw new Error(`${entry}: expected the results of one version in ${folder}, found ${found.map((one) => one.version).join(", ") || "none"}`);
    }
    return chosen[0] as { name: string; version: string };
}

async function read(name: string, benchmark: string): Promise<ResultFile>
{
    return JSON.parse(await readFile(join(folder as string, `${name}_${benchmark}.json`), "utf8")) as ResultFile;
}

const frameworks: FrameworkResult[] = await Promise.all(listed.frameworks.map(async ({ name, entry }) =>
{
    const result = resultName(entry);
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
        const value = (await read(result.name, measure.id)).values["DEFAULT"]?.median;
        if (value === undefined)
        {
            throw new Error(`${result.name}: ${measure.id} holds no result`);
        }
        measures[measure.id] = value;
    }
    return { name, entry, version: result.version, operations, measures };
}));

const run: Run = { date, zerolith, commit: listed.commit.slice(0, 7), statistic: "median", method, machine, ...(note === undefined ? {} : { note }), frameworks };
const target = out ?? join(here, "results", `${date}-${zerolith}.json`);
await writeFile(target, `${JSON.stringify(run, null, 4)}\n`);
console.log(`wrote ${target}`);
