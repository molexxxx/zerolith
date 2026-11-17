#!/usr/bin/env node
/**
 * `create-zerolith`: what `npm create zerolith` runs. It starts a project
 * with `zerolith new` from the `@zerolith/cli` this package depends on at
 * its own version, passing the arguments and the exit status through, and
 * holds no template of its own.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";

/** The file `@zerolith/cli` names as its `zerolith` command, found through the package's manifest, which is the one path of it every version exports. */
function launcher(): string
{
    const manifest = createRequire(import.meta.url).resolve("@zerolith/cli/package.json");
    const { bin } = JSON.parse(readFileSync(manifest, "utf8")) as { bin?: { zerolith?: unknown } };
    if (typeof bin?.zerolith !== "string")
    {
        throw new Error(`${manifest} names no zerolith command`);
    }
    return join(dirname(manifest), bin.zerolith);
}

let command: string;
try
{
    command = launcher();
}
catch (error)
{
    process.stderr.write(`create-zerolith could not find @zerolith/cli, the package whose \`zerolith new\` it runs: ${error instanceof Error ? error.message : String(error)}\nRun \`npx @zerolith/cli new\` instead, which installs the command line and starts the same project.\n`);
    process.exit(1);
}
const result = spawnSync(process.execPath, [command, "new", ...process.argv.slice(2)], { stdio: "inherit", windowsHide: true });
if (result.error)
{
    process.stderr.write(`create-zerolith could not start ${command}: ${result.error.message}\n`);
    process.exit(1);
}
if (result.signal)
{
    process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 1);
