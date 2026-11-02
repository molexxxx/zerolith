/**
 * Runs the keyed-table benchmark (the js-framework-benchmark operation set)
 * for zerolith and for a vanilla DOM baseline in headless Chromium and
 * prints the median of each operation and the ratio between them. The
 * zerolith page loads the production entry unbundled through an import map,
 * the same way a buildless deployment would.
 *   node benchmarks/run.ts [iterations]
 */
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { wholeNumber } from "../scripts/options.ts";
import { checkPage, median, open, operations, rowCount, sample, serve } from "./harness.ts";

const iterations = wholeNumber("iterations", process.argv[2] ?? "7");
const server = await serve(
    { vanilla: { script: "vanilla" }, zerolith: { script: "zerolith", core: "zerolith" } },
    { zerolith: fileURLToPath(new URL("../packages/zerolith/dist/production/", import.meta.url)) }
);

async function run(implementation: string): Promise<Map<string, number>>
{
    const browser = await chromium.launch();
    const tab = await browser.newPage();
    await open(tab, `${server.origin}/bench/${implementation}`);
    const results = new Map<string, number>();
    for (const { name } of operations)
    {
        const samples: number[] = [];
        for (let i = 0; i < iterations; i++)
        {
            samples.push(await sample(tab, name));
        }
        results.set(name, median(samples));
    }
    const rowsAfterClear = await rowCount(tab);
    if (rowsAfterClear !== 0)
    {
        throw new Error(`${implementation}: ${rowsAfterClear} rows left after clear`);
    }
    checkPage(tab);
    await browser.close();
    return results;
}

const vanilla = await run("vanilla");
const zerolith = await run("zerolith");
server.close();

console.log(`median of ${iterations} runs, milliseconds of script plus forced style and layout`);
console.log("operation".padEnd(24) + "vanilla".padStart(10) + "zerolith".padStart(10) + "ratio".padStart(8));
let product = 1;
for (const { name, label } of operations)
{
    const base = vanilla.get(name) ?? 0;
    const ours = zerolith.get(name) ?? 0;
    const ratio = base > 0 ? ours / base : 0;
    product *= ratio > 0 ? ratio : 1;
    console.log(label.padEnd(24) + base.toFixed(1).padStart(10) + ours.toFixed(1).padStart(10) + ratio.toFixed(2).padStart(8));
}
console.log("geometric mean ratio".padEnd(24) + "".padStart(20) + Math.pow(product, 1 / operations.length).toFixed(2).padStart(8));
