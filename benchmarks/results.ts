/**
 * The js-framework-benchmark runs kept in `benchmarks/results/`, one file a
 * run, how the benchmark scores them, and the README section they render.
 * A framework's score is its weighted geometric mean: each operation's time
 * over the fastest framework's in the same run, combined over the nine
 * timed operations with the weights of the official results page, so 1.00
 * would be fastest everywhere.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The nine timed operations, by the benchmark's ids, with their labels and the official results page's weights. */
export const OPERATIONS: readonly { id: string; label: string; weight: number }[] = [
    { id: "01_run1k", label: "create 1,000 rows", weight: 0.64280248137063 },
    { id: "02_replace1k", label: "replace all 1,000 rows", weight: 0.5607178150466176 },
    { id: "03_update10th1k_x16", label: "update every 10th row (4x slowdown)", weight: 0.5643800750716564 },
    { id: "04_select1k", label: "select a row (4x slowdown)", weight: 0.1925635870170522 },
    { id: "05_swap1k", label: "swap 2 rows (4x slowdown)", weight: 0.13200612879341714 },
    { id: "06_remove-one-1k", label: "remove one row (2x slowdown)", weight: 0.5277091212292658 },
    { id: "07_create10k", label: "create 10,000 rows", weight: 0.5644449600965534 },
    { id: "08_create1k-after1k_x2", label: "append 1,000 rows to 1,000", weight: 0.5508359820582848 },
    { id: "09_clear1k_x8", label: "clear 1,000 rows (4x slowdown)", weight: 0.4225836631419211 }
];

/** The memory, size, and first paint results, by the benchmark's ids, with their labels and the decimals they show. */
export const MEASURES: readonly { id: string; label: string; digits: number }[] = [
    { id: "21_ready-memory", label: "ready memory, after load (MB)", digits: 2 },
    { id: "22_run-memory", label: "run memory, with 1,000 rows (MB)", digits: 2 },
    { id: "25_run-clear-memory", label: "after creating and clearing 1,000 rows 5 times (MB)", digits: 2 },
    { id: "41_size-uncompressed", label: "size uncompressed (kB)", digits: 1 },
    { id: "42_size-compressed", label: "size compressed (kB)", digits: 1 },
    { id: "43_first-paint", label: "first paint (ms)", digits: 1 }
];

/** One framework's results in a run. */
export interface FrameworkResult
{
    /** The framework's name as the tables show it. */
    name: string;
    /** The entry's folder under `frameworks/keyed/` in the benchmark's repository. */
    entry: string;
    /** The version the entry ran, as the benchmark names it. */
    version: string;
    /** Each timed operation's duration in milliseconds, by operation id, as the run's statistic. */
    operations?: Record<string, number>;
    /** The weighted geometric mean as published, for a run that kept no operation times. */
    score?: number;
    /** Each memory, size, and first paint result, by measure id. */
    measures?: Record<string, number>;
}

/** One run of the benchmark over every framework. */
export interface Run
{
    /** The day of the run, as YYYY-MM-DD. */
    date: string;
    /** The zerolith version the entry pinned. */
    zerolith: string;
    /** The benchmark repository's commit the other entries came from. */
    commit: string;
    /** The statistic each operation's duration is. */
    statistic: "median" | "mean";
    /** How the run was taken, as the history table says it. */
    method: string;
    /** The machine and browser. */
    machine: string;
    /** What a reader of the history needs to know about the run, if anything. */
    note?: string;
    frameworks: FrameworkResult[];
}

/** The comment lines that hold the rendered section in the README. */
export const SECTION_START = "<!-- results: written by `npm run bench:report` from benchmarks/results/ -->";
export const SECTION_END = "<!-- /results -->";

/** Text a run may carry into the README: letters, digits, spaces, and punctuation that means nothing to Markdown or HTML. */
const PLAIN = /^[A-Za-z0-9 .,;:()+\-/']{1,200}$/;

function fail(where: string, problem: string): never
{
    throw new Error(`${where}: ${problem}`);
}

function record(value: unknown, where: string, keys: readonly string[], required: readonly string[]): Record<string, unknown>
{
    if (value === null || typeof value !== "object" || Array.isArray(value))
    {
        fail(where, "is not an object");
    }
    const object = value as Record<string, unknown>;
    for (const key of Object.keys(object))
    {
        if (!keys.includes(key))
        {
            fail(where, `holds ${JSON.stringify(key)}, which a run does not have`);
        }
    }
    for (const key of required)
    {
        if (!(key in object))
        {
            fail(where, `has no ${key}`);
        }
    }
    return object;
}

function text(value: unknown, where: string, pattern: RegExp): string
{
    if (typeof value !== "string" || !pattern.test(value))
    {
        fail(where, `${JSON.stringify(value)} is not one ${pattern} matches`);
    }
    return value;
}

function numbers(value: unknown, where: string, ids: readonly string[], low: number): Record<string, number>
{
    const object = record(value, where, ids, ids);
    for (const id of ids)
    {
        const entry = object[id];
        if (typeof entry !== "number" || !Number.isFinite(entry) || entry < low || entry > 1e6)
        {
            fail(`${where}.${id}`, `${JSON.stringify(entry)} is not a number from ${low} to 1000000`);
        }
    }
    return object as Record<string, number>;
}

/**
 * A run as its file holds it, checked field by field: a file with a key a
 * run does not have, a value out of range, or text that could reach the
 * README as Markdown or HTML is refused, so a run collected where other
 * code ran cannot change more than its numbers.
 */
export function checkRun(value: unknown, file: string): Run
{
    const run = record(value, file, ["date", "zerolith", "commit", "statistic", "method", "machine", "note", "frameworks"], ["date", "zerolith", "commit", "statistic", "method", "machine", "frameworks"]);
    text(run["date"], `${file}.date`, /^\d{4}-\d{2}-\d{2}$/);
    text(run["zerolith"], `${file}.zerolith`, /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/);
    text(run["commit"], `${file}.commit`, /^[0-9a-f]{7,40}$/);
    text(run["statistic"], `${file}.statistic`, /^(median|mean)$/);
    text(run["method"], `${file}.method`, PLAIN);
    text(run["machine"], `${file}.machine`, PLAIN);
    if (run["note"] !== undefined)
    {
        text(run["note"], `${file}.note`, PLAIN);
    }
    const frameworks = run["frameworks"];
    if (!Array.isArray(frameworks) || frameworks.length === 0)
    {
        fail(`${file}.frameworks`, "is not a list of frameworks");
    }
    frameworks.forEach((entry: unknown, index) =>
    {
        const where = `${file}.frameworks[${index}]`;
        const framework = record(entry, where, ["name", "entry", "version", "operations", "score", "measures"], ["name", "entry", "version"]);
        text(framework["name"], `${where}.name`, /^[A-Za-z][A-Za-z0-9 .-]{0,30}$/);
        text(framework["entry"], `${where}.entry`, /^[a-z0-9][a-z0-9-]{0,60}$/);
        text(framework["version"], `${where}.version`, /^(hand-written|\d[0-9A-Za-z.+ -]{0,40})$/);
        if (framework["operations"] === undefined && framework["score"] === undefined)
        {
            fail(where, "has neither operation times nor a score");
        }
        if (framework["operations"] !== undefined)
        {
            numbers(framework["operations"], `${where}.operations`, OPERATIONS.map((operation) => operation.id), 0.01);
        }
        if (framework["score"] !== undefined && (typeof framework["score"] !== "number" || !(framework["score"] >= 1 && framework["score"] <= 100)))
        {
            fail(`${where}.score`, `${JSON.stringify(framework["score"])} is not a score from 1 to 100`);
        }
        if (framework["measures"] !== undefined)
        {
            numbers(framework["measures"], `${where}.measures`, MEASURES.map((measure) => measure.id), 0);
        }
    });
    return run as unknown as Run;
}

/** A version's three numbers and its prerelease identifiers. */
function parseVersion(version: string): { core: number[]; prerelease: string[] }
{
    const dash = version.indexOf("-");
    const core = dash === -1 ? version : version.slice(0, dash);
    return { core: core.split(".").map(Number), prerelease: dash === -1 ? [] : version.slice(dash + 1).split(".") };
}

/** Two prerelease identifiers in semver order: numbers by value and before words, words by their characters. */
function compareIdentifiers(a: string, b: string): number
{
    const numericA = /^\d+$/.test(a);
    const numericB = /^\d+$/.test(b);
    if (numericA && numericB)
    {
        return Number(a) - Number(b);
    }
    if (numericA !== numericB)
    {
        return numericA ? -1 : 1;
    }
    if (a === b)
    {
        return 0;
    }
    return a < b ? -1 : 1;
}

/** Two versions in semver precedence: negative when `a` is the earlier release, zero when they are one. */
export function compareVersions(a: string, b: string): number
{
    const left = parseVersion(a);
    const right = parseVersion(b);
    for (let index = 0; index < 3; index += 1)
    {
        const difference = (left.core[index] ?? 0) - (right.core[index] ?? 0);
        if (difference !== 0)
        {
            return difference;
        }
    }
    if (left.prerelease.length === 0 || right.prerelease.length === 0)
    {
        return right.prerelease.length - left.prerelease.length;
    }
    for (let index = 0; index < Math.min(left.prerelease.length, right.prerelease.length); index += 1)
    {
        const difference = compareIdentifiers(left.prerelease[index] ?? "", right.prerelease[index] ?? "");
        if (difference !== 0)
        {
            return difference;
        }
    }
    return left.prerelease.length - right.prerelease.length;
}

/**
 * Every run in `folder`, each checked by `checkRun`, the newest release
 * first and a release's runs newest first, so a release measured again
 * later stays among its own runs.
 */
export async function readRuns(folder: string): Promise<Run[]>
{
    const names = (await readdir(folder)).filter((name) => name.endsWith(".json"));
    const runs = await Promise.all(names.map(async (name) => checkRun(JSON.parse(await readFile(join(folder, name), "utf8")), name)));
    return runs.toSorted((a, b) =>
    {
        const byVersion = compareVersions(b.zerolith, a.zerolith);
        return byVersion === 0 ? b.date.localeCompare(a.date) : byVersion;
    });
}

/** Each framework's weighted geometric mean in a run, by name: from its operation times when the run kept them, otherwise as published. */
export function scores(run: Run): Map<string, number>
{
    const fastest = OPERATIONS.map((operation) => Math.min(...run.frameworks.map((framework) => framework.operations?.[operation.id] ?? Infinity)));
    const total = OPERATIONS.reduce((sum, operation) => sum + operation.weight, 0);
    return new Map(run.frameworks.map((framework) =>
    {
        const { operations } = framework;
        if (operations === undefined)
        {
            if (framework.score === undefined)
            {
                throw new Error(`${run.date}: ${framework.name} has neither operation times nor a score`);
            }
            return [framework.name, framework.score];
        }
        const sum = OPERATIONS.reduce((weighted, operation, index) =>
        {
            const time = operations[operation.id];
            if (time === undefined)
            {
                throw new Error(`${run.date}: ${framework.name} has no time for ${operation.id}`);
            }
            return weighted + operation.weight * Math.log(time / (fastest[index] ?? time));
        }, 0);
        return [framework.name, Math.exp(sum / total)];
    }));
}

/** A run's label in a table: its zerolith version and day. */
function label(run: Run): string
{
    return `${run.zerolith}, ${run.date}`;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string
{
    return [`| ${header.join(" | ")} |`, `|${header.map(() => " --- |").join("")}`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

/**
 * The README section the runs render, in the order `readRuns` gives them:
 * the newest run's scores, with a column for the newest earlier release
 * measured the same way when there is one, its operations, its memory,
 * size, and first paint, then every run's scores. Runs taken another way
 * are left out of the column, since a change of machine or method moves
 * every framework's score.
 */
export function renderResults(runs: readonly Run[]): string
{
    const [current] = runs;
    if (current === undefined)
    {
        throw new Error("no run to render");
    }
    const previous = runs.find((run) => run.method === current.method && compareVersions(run.zerolith, current.zerolith) < 0);
    const currentScores = scores(current);
    const previousScores = previous === undefined ? undefined : scores(previous);
    const order = current.frameworks.toSorted((a, b) => (currentScores.get(a.name) ?? 0) - (currentScores.get(b.name) ?? 0));
    const fastest = OPERATIONS.map((operation) => Math.min(...current.frameworks.map((framework) => framework.operations?.[operation.id] ?? Infinity)));
    const lines: string[] = [];
    lines.push("## Results");
    lines.push("");
    lines.push(`The newest release, zerolith ${current.zerolith}, measured on ${current.date} with ${current.method}, next to hand-written JavaScript and seven popular frameworks. The score is each framework's weighted geometric mean: every operation's time over the fastest framework's, combined with the weights of the official results page, so 1.00 would be fastest everywhere and lower is faster. ${previous === undefined ? "No earlier release was measured the same way, so there is no column to compare with; every run's scores are listed below." : `The last column is the newest earlier release measured the same way, ${label(previous)}.`}`);
    lines.push("");
    lines.push(table(
        ["Framework", "Entry", "Version", "Score", ...(previous === undefined ? [] : [label(previous)])],
        order.map((framework) => [
            framework.name,
            `\`${framework.entry}\``,
            framework.version,
            (currentScores.get(framework.name) ?? 0).toFixed(2),
            ...(previousScores === undefined ? [] : [previousScores.has(framework.name) ? (previousScores.get(framework.name) ?? 0).toFixed(2) : "-"])
        ])
    ));
    if (current.frameworks.every((framework) => framework.operations !== undefined))
    {
        lines.push("");
        lines.push("### Every operation");
        lines.push("");
        lines.push(`Each cell is the ${current.statistic} duration in milliseconds, with the factor against the fastest framework for that operation in parentheses.`);
        lines.push("");
        lines.push(table(
            ["Operation", ...order.map((framework) => framework.name)],
            OPERATIONS.map((operation, index) => [operation.label].concat(order.map((framework) =>
            {
                const time = framework.operations?.[operation.id] ?? 0;
                return `${time.toFixed(1)} (${(time / (fastest[index] ?? time)).toFixed(2)})`;
            })))
        ));
    }
    if (current.frameworks.every((framework) => framework.measures !== undefined))
    {
        lines.push("");
        lines.push("### Memory, size, and first paint");
        lines.push("");
        lines.push(table(
            ["Measure", ...order.map((framework) => framework.name)],
            MEASURES.map((measure) => [measure.label].concat(order.map((framework) => framework.measures?.[measure.id]?.toFixed(measure.digits) ?? "-")))
        ));
    }
    lines.push("");
    lines.push("### Every run");
    lines.push("");
    lines.push("Each run's scores, the newest release first. A score compares frameworks within its own run, so a change in how the runs were taken moves every framework's score with it.");
    lines.push("");
    const history = runs.map((run) => ({ run, scores: scores(run) }));
    lines.push(table(
        ["Run", ...order.map((framework) => framework.name), "Measured"],
        history.map(({ run, scores: runScores }) => [label(run)].concat(order.map((framework) => runScores.get(framework.name)?.toFixed(2) ?? "-"), [run.method]))
    ));
    const notes = runs.filter((run) => run.note !== undefined);
    if (notes.length > 0)
    {
        lines.push("");
        lines.push(notes.map((run) => `${label(run)}: ${run.note}`).join(" "));
    }
    return `${SECTION_START}\n${lines.join("\n")}\n${SECTION_END}`;
}

/** A file's text with the one match of `pattern` replaced; throws when it holds none. */
async function replacedOnce(path: string, pattern: RegExp, replacement: string): Promise<string>
{
    const before = await readFile(path, "utf8");
    if (!pattern.test(before))
    {
        throw new Error(`${path} holds no ${pattern}`);
    }
    return before.replace(pattern, replacement);
}

/**
 * Moves what names the measured release, under the repository at `root`:
 * `benchmarks/baseline`, the js-framework-benchmark entry's pins of
 * `zerolith` and `@zerolith/cli`, and the sentences in the roadmap and the
 * entry's README that state the pin. The pin only moves forward: when the
 * baseline names a later release, every file is left as it is and the
 * result is false. Every file is read and checked before any is written,
 * so a refusal changes none. The entry's lockfile is npm's to update.
 */
export async function pinRelease(version: string, root: string): Promise<boolean>
{
    if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version))
    {
        throw new Error(`${JSON.stringify(version)} is not a version`);
    }
    const baselinePath = join(root, "benchmarks", "baseline");
    const pinned = /^zerolith@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)\n?$/.exec(await readFile(baselinePath, "utf8"))?.[1];
    if (pinned === undefined)
    {
        throw new Error(`${baselinePath} names no zerolith release`);
    }
    if (compareVersions(version, pinned) < 0)
    {
        return false;
    }
    const entry = join(root, "benchmarks", "js-framework-benchmark");
    const manifest = JSON.parse(await readFile(join(entry, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    manifest.dependencies["zerolith"] = version;
    manifest.devDependencies["@zerolith/cli"] = version;
    const files: [string, string][] = [
        [baselinePath, `zerolith@${version}\n`],
        [join(entry, "package.json"), `${JSON.stringify(manifest, null, 4)}\n`],
        [join(root, "docs", "ROADMAP.md"), await replacedOnce(join(root, "docs", "ROADMAP.md"), /pinned to `[^`]+`/, `pinned to \`${version}\``)],
        [join(entry, "README.md"), await replacedOnce(join(entry, "README.md"), /The entry pins \S+?,/, `The entry pins ${version},`)]
    ];
    for (const [path, content] of files)
    {
        await writeFile(path, content);
    }
    return true;
}

/** The README with its results section replaced by `section`; throws when the README holds no section to replace. */
export function replaceSection(readme: string, section: string): string
{
    const start = readme.indexOf(SECTION_START);
    const end = readme.indexOf(SECTION_END);
    if (start === -1 || end === -1 || end < start)
    {
        throw new Error(`the README holds no results section between ${SECTION_START} and ${SECTION_END}`);
    }
    return readme.slice(0, start) + section + readme.slice(end + SECTION_END.length);
}
