/**
 * Picks the releases the docs workflow builds and prints them as GitHub
 * Actions outputs: `node scripts/docs/pick.ts <pages-base>`. The stable
 * release is built from main while main carries its line, so a change to
 * the site deploys with the push; otherwise from its line branch, `1.x`
 * for 1.0.0, when the branch exists on origin, and else from its tag. A
 * newer pre-release is built from its tag.
 */
import { execFileSync } from "node:child_process";
import process from "node:process";
import { resolveShown } from "./versions.ts";

const pagesBase = process.argv[2] ?? "/";
const lines = (command: string, args: string[]): string[] => execFileSync(command, args, { encoding: "utf8" }).split("\n").map((line) => line.trim()).filter((line) => line !== "");

/** The core's version on origin's main, or undefined when origin has no main. */
function mainVersion(): string | undefined
{
    try
    {
        return (JSON.parse(execFileSync("git", ["show", "origin/main:packages/zerolith/package.json"], { encoding: "utf8" })) as { version?: string }).version;
    }
    catch
    {
        return undefined;
    }
}

const shown = resolveShown(lines("git", ["tag", "--list", "zerolith@*"]), lines("git", ["branch", "--remotes", "--list", "origin/*.x"]).map((branch) => branch.replace(/^origin\//, "")), pagesBase, mainVersion());
if (shown === undefined)
{
    console.error("no release tag names a version, so there is nothing to build");
    process.exit(1);
}
process.stdout.write([
    `versions=${JSON.stringify(shown.versions)}`,
    `stable_ref=${shown.stableRef}`,
    `next_ref=${shown.nextRef ?? ""}`,
    `stable_base=${shown.versions.stable.base}`,
    `next_base=${shown.versions.next?.base ?? ""}`,
    ""
].join("\n"));
