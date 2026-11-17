#!/usr/bin/env node
/**
 * `zerolith`: runs the native command line from the platform package that
 * matches this machine, passing the arguments and the exit status through.
 * Inside a project that installs another version of `@zerolith/cli`, it
 * hands the command to that copy instead, so a global install runs the
 * version the project's packages were released with.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { HANDED_OFF, locate, projectCopy } from "./index.js";

function musl(): boolean
{
    if (process.platform !== "linux")
    {
        return false;
    }
    const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
    return report?.header?.glibcVersionRuntime === undefined;
}

/** Runs a program to its end on this process's input and output, then leaves with its exit status, or by the signal that ended it. */
function run(program: string, args: readonly string[], env: NodeJS.ProcessEnv): never
{
    const result = spawnSync(program, args, { stdio: "inherit", windowsHide: true, env });
    if (result.error)
    {
        process.stderr.write(`zerolith could not start ${program}: ${result.error.message}\n`);
        process.exit(1);
    }
    if (result.signal)
    {
        process.kill(process.pid, result.signal);
    }
    process.exit(result.status ?? 1);
}

const args = process.argv.slice(2);
const env: NodeJS.ProcessEnv = { ...process.env };
delete env[HANDED_OFF];
const folder = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = (JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { version: string }).version;
let cwd: string | undefined;
try
{
    cwd = process.cwd();
}
catch
{
    cwd = undefined;
}
const copy = cwd === undefined ? undefined : projectCopy({
    args,
    cwd,
    own: { folder, version },
    handedOff: process.env[HANDED_OFF] !== undefined,
    read: (path) =>
    {
        try
        {
            return readFileSync(path, "utf8");
        }
        catch
        {
            return undefined;
        }
    },
    real: (path) =>
    {
        try
        {
            return realpathSync.native(path);
        }
        catch
        {
            return undefined;
        }
    },
});
if (copy !== undefined)
{
    process.stderr.write(`zerolith ${version} is running the project's own command line, ${copy.version}\n`);
    run(process.execPath, [copy.launcher, ...args], { ...env, [HANDED_OFF]: "1" });
}

const require = createRequire(import.meta.url);
let binary: string;
try
{
    binary = locate({
        platform: process.platform,
        arch: process.arch,
        musl: musl(),
        override: process.env["ZEROLITH_BINARY_PATH"],
        resolve: (specifier) => require.resolve(specifier),
    });
}
catch (error)
{
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
}
run(binary, args, env);
