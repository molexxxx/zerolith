import { describe, expect, it } from "vitest";
import { renderToString } from "zerolith/ssr";
import { MEASURES, OPERATIONS, type Run, SECTION_START } from "../../../benchmarks/results.ts";
import { Benchmarks, benchmarksMarkdown } from "../benchmarks.ts";

/** A run in which each framework takes `factor` times hand-written JavaScript's time at every operation, `vanilla` among the names with a factor of 1. */
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

/** The rows of the scores figure, each as its class, framework, score, and bar width or "no bar". */
function rows(markup: string): string[]
{
    const body = markup.slice(markup.indexOf("<tbody>", markup.indexOf("<figure class=\"scores\"")), markup.indexOf("</tbody>"));
    return body.split("</tr>").filter((row) => row.includes("<tr")).map((row) =>
    {
        const kind = /<tr class="([^"]+)">/.exec(row)?.[1];
        const name = /<span class="name">([^<]+)</.exec(row)?.[1];
        const score = /<td class="number score">([^<]+)</.exec(row)?.[1];
        const bar = /class="fill" style="width: ([^"]+)"/.exec(row)?.[1] ?? "no bar";
        return `${kind === undefined ? "" : `${kind} `}${name} ${score} ${bar}`;
    });
}

/** The summary sentence of a run in which each framework takes its factor times hand-written JavaScript's time. */
function summary(factors: Record<string, number>): string | undefined
{
    return /<p class="summary">(.+?)<\/p>/.exec(render([run("0.4.0", "2026-12-03", "on a runner", factors)]))?.[1];
}

const newest = run("0.2.0", "2026-12-01", "on a runner", { vanilla: 1, zerolith: 1.1, Slow: 1.5 });

describe("the benchmarks page", () =>
{
    it("ranks the newest run's frameworks fastest first, zerolith's row marked, each bar its share of the slowest score and none for 1.00", () =>
    {
        const markup = render([newest]);
        expect(rows(markup)).toEqual(["vanilla 1.00 no bar", "ours zerolith 1.10 20.00%", "Slow 1.50 100.00%"]);
        expect(markup.slice(markup.indexOf("<figure class=\"scores\""), markup.indexOf("</figure>"))).not.toContain("the release before");
        expect(markup).toContain("The newest run, measured on 2026-12-01 with on a runner, on a test machine.");
        expect(markup).toContain("<p class=\"summary\">zerolith 1.0.0 scores <strong>1.10</strong>, the fastest of two frameworks.</p>");
        const ticks = markup.slice(markup.indexOf("<span class=\"axis\">"), markup.indexOf("</tfoot>"));
        expect([...ticks.matchAll(/left: ([^"]+)">([^<]+)</g)].map((match) => `${match[2]} at ${match[1]}`)).toEqual(["0% at 0.00%", "+10% at 20.00%", "+20% at 40.00%", "+30% at 60.00%", "+40% at 80.00%", "+50% at 100.00%"]);
    });

    it("leaves the release before out of the figure and its summary when the run measured it alongside, and never compares across runs", () =>
    {
        const before = run("0.1.0", "2026-12-01", "on a runner", { zerolith: 2 }).frameworks[0];
        const earlier = run("0.1.0", "2026-11-01", "on a runner", { vanilla: 1, zerolith: 1.25, Slow: 2 });
        const markup = render([{ ...newest, previous: { ...before, version: "0.1.0" } as Run["frameworks"][number] }, earlier]);
        const figure = markup.slice(markup.indexOf("<figure class=\"scores\""), markup.indexOf("</figure>"));
        expect(rows(markup)).toEqual(["vanilla 1.00 no bar", "ours zerolith 1.10 20.00%", "Slow 1.50 100.00%"]);
        expect(figure).not.toContain("release before");
        expect(figure).not.toContain("2.00");
        expect(figure).not.toContain("1.25");
    });

    it("names a framework that prints the same score as a tie, counting places by the printed scores", () =>
    {
        expect(summary({ vanilla: 1, Solid: 1.096, zerolith: 1.104, Slow: 1.5 })).toBe("zerolith 1.0.0 scores <strong>1.10</strong>, tied with Solid for fastest of three frameworks.");
        expect(summary({ vanilla: 1, Quick: 1.05, zerolith: 1.2, Other: 1.201, Slow: 1.5 })).toBe("zerolith 1.0.0 scores <strong>1.20</strong>, tied with Other for second-fastest of four frameworks.");
        expect(summary({ vanilla: 1, Quick: 1.05, zerolith: 1.2, A: 1.201, B: 1.202, C: 1.203 })).toBe("zerolith 1.0.0 scores <strong>1.20</strong>, tied with A, B, and C for second-fastest of five frameworks.");
        expect(summary({ vanilla: 1, Quick: 1.05, zerolith: 1.2, Slow: 1.5 })).toBe("zerolith 1.0.0 scores <strong>1.20</strong>, the second-fastest of three frameworks.");
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
