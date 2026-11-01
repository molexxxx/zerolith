/**
 * Canary versions. A canary is `0.0.0-canary.<yyyymmdd>.g<commit>`, naming
 * the day and the commit, so it sorts below every release: no range that
 * names a release, such as `^0.1.0-alpha.6`, matches one, and a package
 * manager that takes the highest match never installs a canary in place of
 * a release. Only the `canary` dist-tag, under which the release workflow
 * publishes one when the packages changed since the last, installs it.
 *
 *   node scripts/canary.ts version <yyyymmdd> <commit>   prints the canary version
 *   node scripts/canary.ts commit <version>              prints the commit a canary names
 */
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { checkVersion } from "./release.ts";

/** The canary version for a day, written `yyyymmdd`, and a commit. */
export function canaryVersion(day: string, commit: string): string
{
    if (!/^\d{8}$/.test(day) || !/^[0-9a-f]{7,40}$/.test(commit))
    {
        throw new Error(`cannot make a canary for ${day} and ${commit}`);
    }
    return checkVersion(`0.0.0-canary.${day}.g${commit.slice(0, 7)}`);
}

/** The abbreviated commit a canary version names, in this form or the earlier one that followed a release, as `0.1.0-alpha.4.canary.20261031.g1a2b3c4`, or undefined for any other version. */
export function canaryCommit(version: string): string | undefined
{
    return /[.-]canary\.\d{8}\.g([0-9a-f]{7})$/.exec(version)?.[1];
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
    const [command, first, second] = process.argv.slice(2);
    if (command === "version" && first !== undefined && second !== undefined)
    {
        process.stdout.write(`${canaryVersion(first, second)}\n`);
    }
    else if (command === "commit" && first !== undefined)
    {
        process.stdout.write(`${canaryCommit(first) ?? ""}\n`);
    }
    else
    {
        process.stderr.write("usage: node scripts/canary.ts version <yyyymmdd> <commit> | commit <version>\n");
        process.exitCode = 1;
    }
}
