/**
 * Runs the keyed-table benchmark (the js-framework-benchmark operation set)
 * for zerolith and for a vanilla DOM baseline in headless Chromium, the two
 * pages measured against each other as `npm run bench:compare` measures two
 * builds, and prints each operation's time on each and the ratio between
 * them. The zerolith page loads the production entry unbundled through an
 * import map, the same way a buildless deployment would.
 *   node benchmarks/run.ts [iterations]
 */
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { wholeNumber } from "../scripts/options.ts";
import { MEASURABLE_MS, measurePair, serve } from "./harness.ts";

const iterations = wholeNumber("iterations", process.argv[2] ?? "7");
const server = await serve(
    { vanilla: { script: "vanilla" }, zerolith: { script: "zerolith", core: "zerolith" } },
    { zerolith: fileURLToPath(new URL("../packages/zerolith/dist/production/", import.meta.url)) }
);
const browser = await chromium.launch({ args: ["--js-flags=--expose-gc"] });
try
{
    const timed = await measurePair(browser, server.origin, ["vanilla", "zerolith"], iterations);
    console.log(`median of ${iterations} paired samples per operation in each frame of one page, the pages side by side and trading frames halfway, combined by geometric mean; milliseconds of script plus forced style and layout, with js-framework-benchmark's CPU slowdowns`);
    console.log("operation".padEnd(24) + "vanilla".padStart(10) + "zerolith".padStart(10) + "ratio".padStart(8));
    const ratios: number[] = [];
    for (const { operation, times: [vanilla, zerolith] } of timed)
    {
        const measured = vanilla >= MEASURABLE_MS;
        if (measured)
        {
            ratios.push(zerolith / vanilla);
        }
        console.log(operation.label.padEnd(24) + vanilla.toFixed(1).padStart(10) + zerolith.toFixed(1).padStart(10) + (measured ? (zerolith / vanilla).toFixed(2) : "n/a").padStart(8));
    }
    const mean = Math.exp(ratios.reduce((sum, ratio) => sum + Math.log(ratio), 0) / Math.max(1, ratios.length));
    console.log("geometric mean ratio".padEnd(24) + "".padStart(20) + mean.toFixed(2).padStart(8));
}
finally
{
    await browser.close();
    server.close();
}
