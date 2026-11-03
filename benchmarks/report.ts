/**
 * Writes the results section of `benchmarks/README.md` from the runs in
 * `benchmarks/results/`, newest first; with `--check`, exits with 1 when
 * the README's section is not what the runs render, changing nothing.
 *   node benchmarks/report.ts [--check]
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readRuns, renderResults, replaceSection } from "./results.ts";

const readmePath = fileURLToPath(new URL("./README.md", import.meta.url));
const readme = await readFile(readmePath, "utf8");
const rendered = replaceSection(readme, renderResults(await readRuns(fileURLToPath(new URL("./results/", import.meta.url)))));
if (process.argv.includes("--check"))
{
    if (rendered !== readme)
    {
        console.log("benchmarks/README.md is behind benchmarks/results/; run npm run bench:report");
        process.exitCode = 1;
    }
}
else if (rendered !== readme)
{
    await writeFile(readmePath, rendered);
    console.log("wrote the results section of benchmarks/README.md");
}
