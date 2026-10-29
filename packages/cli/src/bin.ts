#!/usr/bin/env node
/**
 * `zerolith`: runs the native command line from the platform package that
 * matches this machine, passing the arguments and the exit status through.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { locate } from "./index.js";

function musl(): boolean
{
    if (process.platform !== "linux")
    {
        return false;
    }
    const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
    return report?.header?.glibcVersionRuntime === undefined;
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
const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit", windowsHide: true });
if (result.error)
{
    process.stderr.write(`zerolith could not start ${binary}: ${result.error.message}\n`);
    process.exit(1);
}
if (result.signal)
{
    process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 1);
