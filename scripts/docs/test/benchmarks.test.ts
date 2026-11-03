import { describe, expect, it } from "vitest";
import { renderToString } from "zerolith/ssr";
import { MEASURES, OPERATIONS, type Run, SECTION_START } from "../../../benchmarks/results.ts";
import { Benchmarks, benchmarksMarkdown } from "../benchmarks.ts";

/** A run in which each framework takes `factor` times the fastest time at every operation. */
function run(zerolith: string, date: string, method: string, factors: Record<string, number>): Run
{
    return {
        date,
        zerolith,
        commit: "0000000",
        statistic: "median",
        method,
        machine: "a test machine",
        frameworks: Object.entries(factors).map(([name, factor]) => ({
            name,
            entry: name.toLowerCase(),
            version: "1.0.0",
            operations: Object.fromEntries(OPERATIONS.map((operation) => [operation.id, 10 * factor])),
            measures: Object.fromEntries(MEASURES.map((measure) => [measure.id, factor]))
        }))
    };
}

/** The page's markup without the comments that mark its bindings for hydration. */
function render(runs: Run[]): string
{
    return renderToString(Benchmarks({ runs })).replace(/<!--\/?zl:p-->/g, "");
}

/** The rows of the scores figure, each as its framework, score, bar width or "no bar", and tick position. */
function rows(markup: string): string[]
{
    const body = markup.slice(markup.indexOf("<tbody>", markup.indexOf("<figure class=\"scores\"")), markup.indexOf("</tbody>"));
    return body.split("</tr>").filter((row) => row.includes("<tr")).map((row) =>
    {
        const ours = row.includes("<tr class=\"ours\">") ? "ours " : "";
        const name = /<span class="name">([^<]+)</.exec(row)?.[1];
        const score = /<td class="number score">([^<]+)</.exec(row)?.[1];
        const bar = /class="fill" style="width: ([^"]+)"/.exec(row)?.[1] ?? "no bar";
        const tick = /class="tick" style="left: ([^"]+)"/.exec(row)?.[1];
        return `${ours}${name} ${score} ${bar}${tick === undefined ? "" : ` tick ${tick}`}`;
    });
}

const newest = run("0.2.0", "2026-12-01", "on a runner", { vanilla: 1, zerolith: 1.1, Slow: 1.5 });

describe("the benchmarks page", () =>
{
    it("ranks the newest run's frameworks fastest first, zerolith's row marked, each bar its share of the slowest score and none for 1.00", () =>
    {
        const markup = render([newest]);
        expect(rows(markup)).toEqual(["vanilla 1.00 no bar", "ours zerolith 1.10 20.00%", "Slow 1.50 100.00%"]);
        expect(markup).not.toContain("class=\"legend\"");
        expect(markup).toContain("The newest run, measured on 2026-12-01 with on a runner, on a test machine.");
        const ticks = markup.slice(markup.indexOf("<span class=\"axis\">"), markup.indexOf("</tfoot>"));
        expect([...ticks.matchAll(/left: ([^"]+)">([^<]+)</g)].map((match) => `${match[2]} at ${match[1]}`)).toEqual(["0% at 0.00%", "+10% at 20.00%", "+20% at 40.00%", "+30% at 60.00%", "+40% at 80.00%", "+50% at 100.00%"]);
    });

    it("marks each score of the newest earlier release measured the same way, and passes over runs taken another way", () =>
    {
        const compared = run("0.1.0", "2026-11-01", "on a runner", { vanilla: 1, zerolith: 1.25, Slow: 2 });
        const otherwise = run("0.1.5", "2026-11-15", "on a laptop", { vanilla: 1, zerolith: 1.9, Slow: 1.2 });
        const markup = render([newest, otherwise, compared]);
        expect(rows(markup)).toEqual(["vanilla 1.00 no bar tick 0.00%", "ours zerolith 1.10 10.00% tick 25.00%", "Slow 1.50 50.00% tick 100.00%"]);
        expect(markup).toContain("<span class=\"key-tick\" aria-hidden=\"true\"></span>0.1.0, 2026-11-01");
        expect(markup).toContain("<td class=\"number before\" data-label=\"0.1.0\">1.25</td>");
        expect(markup).not.toContain("0.1.5, 2026-11-15</p>");
    });

    it("draws no bar for a score printed as 1.00, and ranks scores that print alike by their exact values", () =>
    {
        const close = run("0.3.0", "2026-12-02", "on a runner", { vanilla: 1, Later: 1.104, Earlier: 1.096, Near: 1.004 });
        expect(rows(render([close]))).toEqual(["vanilla 1.00 no bar", "Near 1.00 no bar", "Earlier 1.10 100.00%", "Later 1.10 100.00%"]);
    });

    it("gives its Markdown twin the results as the README renders them, without the README's comment lines", () =>
    {
        const markdown = benchmarksMarkdown({ runs: [newest] });
        expect(markdown.startsWith("# Benchmarks\n")).toBe(true);
        expect(markdown).toContain("## Results");
        expect(markdown).toContain("## How the runs are measured");
        expect(markdown).not.toContain(SECTION_START);
        expect(markdown).not.toContain("<!--");
    });

    it("refuses to render without a run", () =>
    {
        expect(() => Benchmarks({ runs: [] })).toThrow("holds no run to show");
    });
});
