/**
 * The CI job's advisory check: runs `npm audit --json` in the repository
 * and fails on every advisory but those `.github/audit-exceptions.json`
 * lets through until their review day, as `scripts/advisories.ts` weighs
 * them.
 *   node scripts/audit.ts [--report <file>] [--exceptions <file>] [--today <YYYY-MM-DD>]
 * The flags stand in for npm audit's report, the exceptions file, and the
 * day, so the tests need neither the registry nor the clock.
 */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { advisoriesOf, checkExceptions, verdict } from "./advisories.ts";

const { values: flags } = parseArgs({
    options: { report: { type: "string" }, exceptions: { type: "string" }, today: { type: "string" } },
    strict: true
});
const root = fileURLToPath(new URL("../", import.meta.url));
const exceptionsFile = flags.exceptions ?? fileURLToPath(new URL("../.github/audit-exceptions.json", import.meta.url));

let text: string;
if (flags.report === undefined)
{
    const options = { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 } as const;
    const audit = process.platform === "win32" ? spawnSync("npm audit --json", { ...options, shell: true }) : spawnSync("npm", ["audit", "--json"], options);
    if (audit.error !== undefined)
    {
        throw audit.error;
    }
    text = audit.stdout;
}
else
{
    text = await readFile(flags.report, "utf8");
}

const advisories = advisoriesOf(JSON.parse(text));
const exceptions = checkExceptions(JSON.parse(await readFile(exceptionsFile, "utf8")), exceptionsFile);
const { failures, excused } = verdict(advisories, exceptions, flags.today ?? new Date().toISOString().slice(0, 10));
for (const advisory of excused)
{
    const exception = exceptions.find((one) => one.advisory === advisory.id);
    console.log(`let through until ${exception?.review ?? "?"}: ${advisory.id} in ${advisory.package}, for the reason ${exceptionsFile} gives`);
}
if (failures.length > 0)
{
    console.error(`npm audit: ${failures.length} finding${failures.length === 1 ? "" : "s"}`);
    for (const failure of failures)
    {
        console.error(`  ${failure}`);
    }
    process.exitCode = 1;
}
else
{
    console.log(`npm audit: ${advisories.length === 0 ? "no advisories" : advisories.length === 1 ? "1 advisory, let through by its exception" : `${advisories.length} advisories, each let through by its exception`}`);
}
