import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OPERATIONS, type Run, checkRun, compareVersions, pinRelease, readRuns, renderResults, replaceSection, scores } from "../../benchmarks/results.ts";

const folder = new URL("../../benchmarks/", import.meta.url);

/** A run of the given frameworks, each operation taking `time(name, operation)` milliseconds. */
function run(names: readonly string[], time: (name: string, operation: string) => number): Run
{
    return {
        date: "2026-01-01",
        zerolith: "0.0.0",
        commit: "0000000",
        statistic: "median",
        method: "a test",
        machine: "a test",
        frameworks: names.map((name) => ({ name, entry: name, version: "1.0.0", operations: Object.fromEntries(OPERATIONS.map((operation) => [operation.id, time(name, operation.id)])) }))
    };
}

/** A run of two frameworks that differs from `run`'s only in the fields given. */
function taken(fields: Partial<Run>): Run
{
    return { ...run(["vanilla", "zerolith"], (name) => (name === "vanilla" ? 10 : 11)), ...fields };
}

/** The header row of the first table in rendered Markdown. */
function header(markdown: string): string | undefined
{
    return markdown.split("\n").find((line) => line.startsWith("| Framework |"));
}

describe("benchmark scores", () =>
{
    it("gives the framework fastest at every operation 1.00, one twice as slow everywhere 2.00", () =>
    {
        const result = scores(run(["fast", "slow"], (name) => (name === "fast" ? 10 : 20)));
        expect(result.get("fast")).toBeCloseTo(1, 10);
        expect(result.get("slow")).toBeCloseTo(2, 10);
    });

    it("weighs each operation as the official results page does", () =>
    {
        const result = scores(run(["fast", "slow"], (name, operation) => (name === "slow" && operation === "01_run1k" ? 20 : 10)));
        const total = OPERATIONS.reduce((sum, operation) => sum + operation.weight, 0);
        expect(result.get("slow")).toBeCloseTo(Math.exp((0.64280248137063 * Math.log(2)) / total), 10);
        expect(total).toBeCloseTo(4.1580, 3);
    });

    it("reproduces the published scores of the 2026-11-01 run from its operation times", async () =>
    {
        const published = { vanilla: "1.01", Solid: "1.14", zerolith: "1.14", Svelte: "1.15", Lit: "1.24", Vue: "1.24", Preact: "1.34", Angular: "1.38", React: "1.48" };
        const recorded = (await readRuns(fileURLToPath(new URL("results/", folder)))).find((one) => one.date === "2026-11-01");
        expect(recorded).toBeDefined();
        const result = scores(recorded as Run);
        expect(Object.fromEntries([...result].map(([name, score]) => [name, score.toFixed(2)]))).toEqual(published);
    });

    it("refuses a framework with neither operation times nor a score", () =>
    {
        const broken = run(["one"], () => 10);
        delete (broken.frameworks[0] as { operations?: unknown }).operations;
        expect(() => scores(broken)).toThrow("has neither operation times nor a score");
    });
});

describe("compareVersions", () =>
{
    it("orders versions as the semver specification's own example does, and alpha.10 after alpha.9", () =>
    {
        const precedence = ["0.1.0-alpha.9", "0.1.0-alpha.10", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.1.0", "2.0.0", "10.0.0"];
        expect(precedence.toReversed().toSorted(compareVersions)).toEqual(precedence);
        expect(precedence.toSorted((a, b) => -compareVersions(a, b))).toEqual(precedence.toReversed());
        expect(compareVersions("0.1.0-alpha.8", "0.1.0-alpha.8")).toBe(0);
    });
});

describe("benchmarks/results", () =>
{
    it("lists, in every run, the frameworks frameworks.json names", async () =>
    {
        const listed = JSON.parse(await readFile(new URL("frameworks.json", folder), "utf8")) as { frameworks: { name: string; entry: string }[] };
        for (const recorded of await readRuns(fileURLToPath(new URL("results/", folder))))
        {
            expect(recorded.frameworks.map(({ name, entry }) => ({ name, entry })).toSorted(byName), recorded.date).toEqual(listed.frameworks.toSorted(byName));
        }
    });

    it("renders the results section the README holds", async () =>
    {
        const readme = await readFile(new URL("README.md", folder), "utf8");
        const runs = await readRuns(fileURLToPath(new URL("results/", folder)));
        expect(replaceSection(readme, renderResults(runs))).toBe(readme);
    });

    it("refuses a README without the section's comment lines", () =>
    {
        expect(() => replaceSection("# Benchmarks\n", "section")).toThrow("holds no results section");
    });

    it("reads the newest release first, and a release measured again later among its own runs", async () =>
    {
        const scratch = await mkdtemp(join(tmpdir(), "zerolith-runs-"));
        try
        {
            for (const [date, zerolith] of [["2026-11-10", "0.1.0-alpha.9"], ["2026-11-20", "0.1.0-alpha.10"], ["2026-12-01", "0.1.0-alpha.9"]] as const)
            {
                await writeFile(join(scratch, `${date}-${zerolith}.json`), JSON.stringify(taken({ date, zerolith })));
            }
            expect((await readRuns(scratch)).map((one) => `${one.zerolith} ${one.date}`)).toEqual(["0.1.0-alpha.10 2026-11-20", "0.1.0-alpha.9 2026-12-01", "0.1.0-alpha.9 2026-11-10"]);
        }
        finally
        {
            await rm(scratch, { recursive: true, force: true });
        }
    });
});

describe("renderResults", () =>
{
    it("compares the newest run with the newest earlier release measured the same way, past runs taken otherwise", () =>
    {
        const rendered = renderResults([
            taken({ zerolith: "0.3.0", date: "2026-03-01", method: "on a runner" }),
            taken({ zerolith: "0.3.0", date: "2026-02-20", method: "on a runner" }),
            taken({ zerolith: "0.2.0", date: "2026-02-01", method: "on a laptop" }),
            taken({ zerolith: "0.1.0", date: "2026-01-01", method: "on a runner" })
        ]);
        expect(header(rendered)).toBe("| Framework | Entry | Version | Score | 0.1.0, 2026-01-01 |");
        expect(rendered).toContain("The last column is the newest earlier release measured the same way, 0.1.0, 2026-01-01.");
    });

    it("leaves the column out when no earlier release was measured the same way", () =>
    {
        const rendered = renderResults([taken({ zerolith: "0.2.0", method: "on a runner" }), taken({ zerolith: "0.1.0", method: "on a laptop" })]);
        expect(header(rendered)).toBe("| Framework | Entry | Version | Score |");
        expect(rendered).toContain("No earlier release was measured the same way");
        expect(rendered).toContain("| 0.1.0, 2026-01-01 |");
    });
});

/** Orders frameworks by name, for comparing lists whose order does not matter. */
function byName(a: { name: string }, b: { name: string }): number
{
    return a.name.localeCompare(b.name);
}

/** A run `checkRun` takes, as plain data to break. */
function valid(): Record<string, unknown>
{
    return JSON.parse(JSON.stringify(run(["vanilla", "zerolith"], () => 10))) as Record<string, unknown>;
}

/** The second framework of a run's plain data. */
function framework(value: Record<string, unknown>): Record<string, unknown>
{
    return (value["frameworks"] as Record<string, unknown>[])[1] as Record<string, unknown>;
}

/** The files the pin lives in. */
const PIN_FILES = ["benchmarks/baseline", "benchmarks/js-framework-benchmark/package.json", "benchmarks/js-framework-benchmark/README.md", "docs/ROADMAP.md"];

/** A copy of the given repository files under a new temporary root. */
async function copyRoot(paths: readonly string[] = PIN_FILES): Promise<string>
{
    const root = await mkdtemp(join(tmpdir(), "zerolith-pin-"));
    for (const path of paths)
    {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await copyFile(fileURLToPath(new URL(`../../${path}`, import.meta.url)), join(root, path));
    }
    return root;
}

/** A copy of what `npm run bench:report` runs, reads, and writes: its two scripts, the kept runs, the README, and the files the pin lives in. */
async function copyReport(): Promise<string>
{
    const kept = (await readdir(new URL("results/", folder))).map((name) => `benchmarks/results/${name}`);
    return copyRoot(PIN_FILES.concat(["benchmarks/report.ts", "benchmarks/results.ts", "benchmarks/frameworks.json", "benchmarks/README.md"], kept));
}

/** Every file under `root`, by path, with its text. */
async function snapshot(root: string): Promise<Map<string, string>>
{
    const files = new Map<string, string>();
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true }))
    {
        if (entry.isFile())
        {
            const path = join(entry.parentPath, entry.name);
            files.set(path, await readFile(path, "utf8"));
        }
    }
    return files;
}

/** Runs the copy of `report.ts` under `root` with `args`, as `npm run bench:report --` does. */
function report(root: string, ...args: string[]): { status: number | null; output: string }
{
    const result = spawnSync(process.execPath, [join(root, "benchmarks", "report.ts"), ...args], { encoding: "utf8" });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** The alpha.8 run as kept under `root`. */
async function alpha8(root: string): Promise<Run>
{
    return JSON.parse(await readFile(join(root, "benchmarks/results/2026-11-02-0.1.0-alpha.8.json"), "utf8")) as Run;
}

describe("pinRelease", () =>
{
    it("moves the baseline, both pins, and the two sentences that state the pin, and nothing else", async () =>
    {
        const root = await copyRoot();
        try
        {
            const before = JSON.parse(await readFile(join(root, "benchmarks/js-framework-benchmark/package.json"), "utf8")) as Record<string, Record<string, string>>;
            const roadmap = await readFile(join(root, "docs/ROADMAP.md"), "utf8");
            expect(await pinRelease("9.9.9-alpha.1", root)).toBe(true);
            expect(await readFile(join(root, "benchmarks/baseline"), "utf8")).toBe("zerolith@9.9.9-alpha.1\n");
            const after = JSON.parse(await readFile(join(root, "benchmarks/js-framework-benchmark/package.json"), "utf8")) as Record<string, Record<string, string>>;
            expect(after).toEqual({ ...before, dependencies: { ...before["dependencies"], zerolith: "9.9.9-alpha.1" }, devDependencies: { ...before["devDependencies"], "@zerolith/cli": "9.9.9-alpha.1" } });
            const moved = await readFile(join(root, "docs/ROADMAP.md"), "utf8");
            expect(moved.match(/pinned to `([^`]+)`/)?.[1]).toBe("9.9.9-alpha.1");
            expect(moved.replace("pinned to `9.9.9-alpha.1`", "")).toBe(roadmap.replace(/pinned to `[^`]+`/, ""));
            expect((await readFile(join(root, "benchmarks/js-framework-benchmark/README.md"), "utf8")).match(/The entry pins (\S+?),/)?.[1]).toBe("9.9.9-alpha.1");
        }
        finally
        {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("leaves a pin that names a later release as it is", async () =>
    {
        const root = await copyRoot();
        try
        {
            const before = await snapshot(root);
            expect(await pinRelease("0.0.1", root)).toBe(false);
            expect(await snapshot(root)).toEqual(before);
        }
        finally
        {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("refuses what is not a version, a baseline that names no release, and a file that no longer states the pin, changing no file", async () =>
    {
        const root = await copyRoot();
        try
        {
            await expect(pinRelease("1.0.0; rm -rf /", root)).rejects.toThrow("is not a version");
            await writeFile(join(root, "docs/ROADMAP.md"), "# Roadmap\n");
            const before = await snapshot(root);
            await expect(pinRelease("9.9.9", root)).rejects.toThrow("holds no");
            expect(await snapshot(root)).toEqual(before);
            await writeFile(join(root, "benchmarks/baseline"), "HEAD\n");
            await expect(pinRelease("9.9.9", root)).rejects.toThrow("names no zerolith release");
        }
        finally
        {
            await rm(root, { recursive: true, force: true });
        }
    });
});

describe("npm run bench:report", () =>
{
    it("adds a run collected elsewhere under the name its fields give, pins its release, and leads the README with it", async () =>
    {
        const root = await copyReport();
        try
        {
            const measured = { ...await alpha8(root), date: "2026-12-01", zerolith: "9.9.9-alpha.1" };
            await writeFile(join(root, "run.json"), JSON.stringify(measured));
            const result = report(root, "--pin", "9.9.9-alpha.1", "--add", join(root, "run.json"));
            expect(result.status, result.output).toBe(0);
            expect(JSON.parse(await readFile(join(root, "benchmarks/results/2026-12-01-9.9.9-alpha.1.json"), "utf8"))).toEqual(measured);
            expect(await readFile(join(root, "benchmarks/baseline"), "utf8")).toBe("zerolith@9.9.9-alpha.1\n");
            const readme = await readFile(join(root, "benchmarks/README.md"), "utf8");
            expect(readme).toContain("The newest release, zerolith 9.9.9-alpha.1, measured on 2026-12-01");
            expect(header(readme)).toBe("| Framework | Entry | Version | Score | 0.1.0-alpha.8, 2026-11-02 |");
        }
        finally
        {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("refuses a run of another release than the pin, of other frameworks than frameworks.json lists, or kept already, changing no file", async () =>
    {
        const root = await copyReport();
        try
        {
            const kept = await alpha8(root);
            const refused: [string, unknown, string[], string][] = [
                ["other.json", { ...kept, date: "2026-12-01", zerolith: "9.9.9-alpha.2" }, ["--pin", "9.9.9-alpha.1"], "measured 9.9.9-alpha.2, not 9.9.9-alpha.1"],
                ["fewer.json", { ...kept, date: "2026-12-01", frameworks: kept.frameworks.slice(1) }, [], "not the frameworks frameworks.json lists"],
                ["again.json", kept, [], "a run is never replaced"]
            ];
            for (const [name, value] of refused)
            {
                await writeFile(join(root, name), JSON.stringify(value));
            }
            const before = await snapshot(root);
            for (const [name, , args, message] of refused)
            {
                const result = report(root, ...args, "--add", join(root, name));
                expect(result.status, name).not.toBe(0);
                expect(result.output, name).toContain(message);
                expect(await snapshot(root), name).toEqual(before);
            }
        }
        finally
        {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("with --check, exits with 1 when the README is behind the runs, and takes neither --add nor --pin", async () =>
    {
        const root = await copyReport();
        try
        {
            await writeFile(join(root, "benchmarks/results/2026-12-01-9.9.9.json"), JSON.stringify({ ...await alpha8(root), date: "2026-12-01", zerolith: "9.9.9" }));
            const before = await snapshot(root);
            const behind = report(root, "--check");
            expect(behind.status).toBe(1);
            expect(behind.output).toContain("is behind");
            expect(await snapshot(root)).toEqual(before);
            const mixed = report(root, "--check", "--pin", "9.9.9");
            expect(mixed.status).not.toBe(0);
            expect(mixed.output).toContain("takes neither --add nor --pin");
            expect(await snapshot(root)).toEqual(before);
        }
        finally
        {
            await rm(root, { recursive: true, force: true });
        }
    });
});

describe("checkRun", () =>
{
    it("takes a run that holds what a run has", () =>
    {
        expect(checkRun(valid(), "run.json").frameworks).toHaveLength(2);
    });

    it("refuses a key a run does not have, at the top or in a framework", () =>
    {
        expect(() => checkRun({ ...valid(), script: "x" }, "run.json")).toThrow("holds \"script\"");
        const inner = valid();
        framework(inner)["readme"] = "x";
        expect(() => checkRun(inner, "run.json")).toThrow("holds \"readme\"");
    });

    it("refuses text that could reach the README as Markdown or HTML", () =>
    {
        for (const [field, value] of [["version", "1.0 | 9.99"], ["name", "<img src=x>"], ["entry", "../solid"]] as const)
        {
            const bad = valid();
            framework(bad)[field] = value;
            expect(() => checkRun(bad, "run.json"), field).toThrow(`frameworks[1].${field}`);
        }
        expect(() => checkRun({ ...valid(), method: "medians](javascript:alert(1))" }, "run.json")).toThrow("run.json.method");
        expect(() => checkRun({ ...valid(), note: "a `code` note" }, "run.json")).toThrow("run.json.note");
    });

    it("refuses a time or measure out of range, a missing operation, and a run with no frameworks", () =>
    {
        const negative = valid();
        (framework(negative)["operations"] as Record<string, unknown>)["01_run1k"] = -1;
        expect(() => checkRun(negative, "run.json")).toThrow("operations.01_run1k");
        const missing = valid();
        delete (framework(missing)["operations"] as Record<string, unknown>)["09_clear1k_x8"];
        expect(() => checkRun(missing, "run.json")).toThrow("has no 09_clear1k_x8");
        expect(() => checkRun({ ...valid(), frameworks: [] }, "run.json")).toThrow("is not a list of frameworks");
    });
});
