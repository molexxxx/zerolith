import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OPERATIONS, type Run, checkRun, readRuns, renderResults, replaceSection, scores } from "../../benchmarks/results.ts";

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
