/**
 * The benchmarks page: the newest release's js-framework-benchmark scores
 * next to hand-written JavaScript and seven frameworks as a ranked figure,
 * with the release before when the run measured it alongside, then every
 * operation's time, memory, size, and first paint, each run's
 * scores, and how the runs are taken, all rendered from the runs in
 * benchmarks/results/ when the site is built. The Markdown twin carries the
 * same results as the benchmarks README renders them.
 */
import { type View, html } from "zerolith";
import { MEASURES, OPERATIONS, type FrameworkResult, type Ranked, type Run, SECTION_END, SECTION_START, label, measuresNote, noneFastest, ranked, renderResults, rivals, scores } from "../../benchmarks/results.ts";
import { repository } from "./layout.ts";

/** What the page renders: the newest release's newest run first, as `readRuns` orders them. */
export interface BenchmarksData
{
    runs: Run[];
}

/** The page's description, for its head, the llms index, and the Markdown twin. */
export function benchmarksDescription(data: BenchmarksData): string
{
    const [current] = data.runs;
    return `zerolith on js-framework-benchmark next to hand-written JavaScript and ${current === undefined ? "popular frameworks" : rivals(current)}, measured again with every release.`;
}

const readme = `${repository}/blob/main/benchmarks/README.md`;
const officialResults = "https://krausest.github.io/js-framework-benchmark/";

const contents = [
    { id: "scores", title: "Scores" },
    { id: "every-operation", title: "Every operation" },
    { id: "memory-size-and-first-paint", title: "Memory, size, and first paint" },
    { id: "every-run", title: "Every run" },
    { id: "how-the-runs-are-measured", title: "How the runs are measured" }
];

/** The method, as paragraphs of text and links, shared by the page and its Markdown twin. */
const method: Array<Array<string | { text: string; href: string }>> = [
    ["js-framework-benchmark renders the same table of rows in every framework and times nine operations on it, from creating 1,000 rows to clearing them. Its driver clicks a button in Chrome and measures from the click to the end of the paint it causes, from Chrome's performance trace, so script, style, layout, and paint all count, and five of the operations run with the CPU slowed down, as the official runs do. Each time here is the median of a run's samples: 15 of each operation, and 25 of selecting a row."],
    ["Every framework is the keyed entry of the benchmark's repository at the commit ", { text: "frameworks.json", href: `${repository}/blob/main/benchmarks/frameworks.json` }, " names, built from its own lockfile, and zerolith is ", { text: "the entry in this repository", href: `${repository}/tree/main/benchmarks/js-framework-benchmark` }, ", pinned to the release. The memory results are what Chrome reports for the page after an action and a forced garbage collection, and the size results are the bytes of the entry's files; the benchmark takes one sample of each a pass, so each release's run repeats them for five passes and keeps the medians."],
    ["Each release is measured once it is published, by ", { text: "the benchmarks workflow", href: `${repository}/blob/main/.github/workflows/benchmarks.yml` }, ", and the run is kept in the repository with the machine and method it used. A change of machine or method moves every framework's score, so each release's run also measures the release before in the same session on the same machine, and the two zerolith rows compare like for like. The earlier runs are listed under Every run, each with how it was taken."],
    ["These are this project's runs, not the official results, which the benchmark's maintainer measures and publishes at ", { text: "krausest.github.io/js-framework-benchmark", href: officialResults }, "; zerolith is not among them until its entry is accepted upstream. ", { text: "The benchmarks README", href: readme }, " has the full method and the steps to take a run yourself."]
];

/** Each framework of the newest run in score order, fastest first. */
function ordered(run: Run, runScores: Map<string, number>): FrameworkResult[]
{
    return run.frameworks.toSorted((a, b) => (runScores.get(a.name) ?? 0) - (runScores.get(b.name) ?? 0));
}

/** A bar's length for a score: how much slower than 1.00 it is, as a share of the slowest score shown. */
function length(score: number, slowest: number): string
{
    return slowest <= 1 ? "0%" : `${(((score - 1) / (slowest - 1)) * 100).toFixed(2)}%`;
}

/** The axis under the bars: extra time from 0% to the slowest score shown, in at most six even steps. */
function axis(slowest: number): Array<{ text: string; at: string }>
{
    const extra = slowest - 1;
    if (extra <= 0)
    {
        return [];
    }
    const step = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10].find((candidate) => extra / candidate <= 5) ?? extra;
    return Array.from({ length: Math.floor(extra / step + 1e-9) + 1 }, (_, index) => ({ text: index === 0 ? "0%" : `+${Math.round(index * step * 100)}%`, at: length(1 + index * step, slowest) }));
}

function Paragraph(parts: Array<string | { text: string; href: string }>)
{
    return html`<p>${parts.map((part) => (typeof part === "string" ? part : html`<a href=${part.href}>${part.text}</a>`))}</p>`;
}

/** A row's score as the page prints it, to two decimals, so its bar never disagrees with its number. */
function printed(row: Ranked): number
{
    return Number(row.score.toFixed(2));
}

/** The class of a row of the ranked figure: zerolith now, zerolith's release before, or another framework. */
function rowClass(row: Ranked): string | null
{
    if (row.before)
    {
        return "before";
    }
    return row.name === "zerolith" ? "ours" : null;
}

/**
 * The ranked figure: one row per framework, and one for zerolith's release
 * before when the run measured it, each with its score and a bar of how
 * much slower than the fastest it is. Bars follow the scores as printed, so
 * a 1.00 draws no bar.
 */
function Scores(run: Run)
{
    const rows = ranked(run);
    const slowest = Math.max(...rows.map(printed));
    return html`
        <figure class="scores" id="scores">
            <p class="key">Lower is faster. A score of 1.00 would be the fastest framework at every operation, and each bar is the extra time a framework takes over that.${noneFastest(run)}${run.previous === undefined ? "" : ` The outlined bar is zerolith ${run.previous.version}, the release before, measured in the same session on the same machine.`}</p>
            <div class="table">
                <table>
                    <thead>
                        <tr>
                            <th scope="col">Framework</th>
                            <th scope="col" class="number">Score</th>
                            <th scope="col" class="bar">Extra time over the fastest</th>
                        </tr>
                    </thead>
                    <tbody>${rows.map((row) => html`
                        <tr class=${rowClass(row)}>
                            <th scope="row"><span class="name">${row.name}</span><span class="entry">${row.entry} <span class="version">${row.version}</span>${row.before ? ", the release before" : ""}</span></th>
                            <td class="number score">${printed(row).toFixed(2)}</td>
                            <td class="bar"><span class="track" aria-hidden="true">${printed(row) > 1 ? html`<span class="fill" style=${`width: ${length(printed(row), slowest)}`}></span>` : null}</span></td>
                        </tr>`)}</tbody>
                    <tfoot aria-hidden="true">
                        <tr>
                            <td colspan="2"></td>
                            <td class="bar"><span class="axis">${axis(slowest).map((tick) => html`<span style=${`left: ${tick.at}`}>${tick.text}</span>`)}</span></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <figcaption>Figure 1. The newest run, measured on ${run.date} with ${run.method}, on ${run.machine}. These are not the official results; <a href="#how-the-runs-are-measured">How the runs are measured</a> says how they are taken.</figcaption>
        </figure>`;
}

/** A table of the frameworks in score order, zerolith's column on the surface plane, with one row per item. */
function FrameworkTable<T>(order: readonly FrameworkResult[], first: string, items: readonly T[], row: (item: T) => View | string, cell: (item: T, framework: FrameworkResult) => View | string)
{
    return html`
        <div class="table frameworks">
            <table>
                <thead>
                    <tr>
                        <th scope="col">${first}</th>
                        ${order.map((framework) => html`<th scope="col" class=${framework.name === "zerolith" ? "ours" : null}>${framework.name}</th>`)}
                    </tr>
                </thead>
                <tbody>${items.map((item) => html`
                    <tr>
                        <th scope="row">${row(item)}</th>
                        ${order.map((framework) => html`<td class=${framework.name === "zerolith" ? "ours" : null} data-label=${framework.name}>${cell(item, framework)}</td>`)}
                    </tr>`)}</tbody>
            </table>
        </div>`;
}

/** The benchmarks page's main content. */
export function Benchmarks(data: BenchmarksData): View
{
    const [current] = data.runs;
    if (current === undefined)
    {
        throw new Error("benchmarks/results/ holds no run to show");
    }
    const order = ordered(current, scores(current));
    const fastest = new Map(OPERATIONS.map((operation) => [operation.id, Math.min(...current.frameworks.map((framework) => framework.operations?.[operation.id] ?? Infinity))]));
    const history = data.runs.map((run) => ({ run, scores: scores(run) }));
    const notes = data.runs.filter((run) => run.note !== undefined);
    return html`
        <section class="masthead bench">
            <div class="title">
                <h1>Benchmarks</h1>
                <p class="lead">zerolith ${current.zerolith} next to hand-written JavaScript and ${rivals(current)} on js-framework-benchmark, measured again with every release.</p>
                <nav class="contents" aria-label="On this page">${contents.map((entry) => html`<a href=${`#${entry.id}`}>${entry.title}</a>`)}</nav>
            </div>
        </section>
        ${Scores(current)}
        <section class="band" id="every-operation">
            <h2>Every operation</h2>
            <p>Each cell is the median time in milliseconds, over its factor against the fastest framework at that operation. The operations marked with a slowdown run with Chrome slowing the CPU by that factor.</p>
            ${FrameworkTable(order, "Operation", OPERATIONS, (operation) => operation.label, (operation, framework) =>
            {
                const time = framework.operations?.[operation.id];
                const best = fastest.get(operation.id) ?? Infinity;
                return time === undefined ? "-" : html`<span class="time">${time.toFixed(1)}</span><span class="factor">${(time / best).toFixed(2)}</span>`;
            })}
        </section>
        <section class="band" id="memory-size-and-first-paint">
            <h2>Memory, size, and first paint</h2>
            <p>${measuresNote(current)}</p>
            ${FrameworkTable(order, "Measure", MEASURES, (measure) => measure.label, (measure, framework) => framework.measures?.[measure.id]?.toFixed(measure.digits) ?? "-")}
        </section>
        <section class="band" id="every-run">
            <h2>Every run</h2>
            <p>Each run's scores, the newest release first, with how the run was taken; lower is faster. A score compares frameworks within its own run, so a change in how runs are taken moves every framework's score with it.</p>
            ${FrameworkTable(order, "Run", history, (entry) => html`<span class="main">${entry.run.zerolith}</span><span class="sub">${entry.run.date}</span><span class="how">${entry.run.method}</span>`, (entry, framework) => entry.scores.get(framework.name)?.toFixed(2) ?? "-")}
            ${notes.length === 0 ? null : html`<p class="notes">${notes.map((run) => `${label(run)}: ${run.note}`).join(" ")}</p>`}
        </section>
        <section class="band method" id="how-the-runs-are-measured">
            <h2>How the runs are measured</h2>
            ${method.map((parts) => Paragraph(parts))}
            <p class="twin"><a href="/benchmarks.md">This page as Markdown</a></p>
        </section>`;
}

/** The benchmarks page as Markdown: the results as the benchmarks README renders them, then the method. */
export function benchmarksMarkdown(data: BenchmarksData): string
{
    const section = renderResults(data.runs).replace(`${SECTION_START}\n`, "").replace(`\n${SECTION_END}`, "");
    return [
        "# Benchmarks",
        "",
        benchmarksDescription(data),
        "",
        section,
        "",
        "## How the runs are measured",
        "",
        method.map((parts) => parts.map((part) => (typeof part === "string" ? part : `[${part.text}](${part.href})`)).join("")).join("\n\n")
    ].join("\n");
}
