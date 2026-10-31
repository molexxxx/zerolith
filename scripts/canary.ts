/**
 * Canary versions. A canary is the current version with a canary prerelease
 * after it, naming the day and the commit, so it sorts after the release it
 * builds on and before the next one: `0.1.0-alpha.4` gives
 * `0.1.0-alpha.4.canary.20261031.g1a2b3c4`, and `1.2.0` gives
 * `1.2.1-canary.20261031.g1a2b3c4`. The release workflow publishes one under
 * the `canary` dist-tag when the packages changed since the last.
 *
 *   node scripts/canary.ts version <yyyymmdd> <commit>   prints the canary version
 *   node scripts/canary.ts commit <version>              prints the commit a canary names
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { checkVersion } from "./release.ts";

/** The canary version of `version` for a day, written `yyyymmdd`, and a commit. */
export function canaryVersion(version: string, day: string, commit: string): string
{
    const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(checkVersion(version));
    if (match === null || !/^\d{8}$/.test(day) || !/^[0-9a-f]{7,40}$/.test(commit))
    {
        throw new Error(`cannot make a canary of ${version} for ${day} and ${commit}`);
    }
    const suffix = `canary.${day}.g${commit.slice(0, 7)}`;
    if (match[4] !== undefined)
    {
        return checkVersion(`${version}.${suffix}`);
    }
    return checkVersion(`${match[1]}.${match[2]}.${Number(match[3]) + 1}-${suffix}`);
}

/** The abbreviated commit a canary version names, or undefined for any other version. */
export function canaryCommit(version: string): string | undefined
{
    return /[.-]canary\.\d{8}\.g([0-9a-f]{7})$/.exec(version)?.[1];
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
    const [command, first, second] = process.argv.slice(2);
    if (command === "version" && first !== undefined && second !== undefined)
    {
        const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
        process.stdout.write(`${canaryVersion(manifest.version, first, second)}\n`);
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
