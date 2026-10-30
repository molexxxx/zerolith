/**
 * Runs the zerolith command line built from this repository, so the
 * examples run on the code of this checkout:
 *   node scripts/zerolith.ts dev examples/notes
 * The binary is ZEROLITH_BINARY_PATH when it is set, or else the newer of
 * target/release and target/debug; `cargo build --release` writes one.
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const executable = process.platform === "win32" ? "zerolith.exe" : "zerolith";

/** The binary to run, or undefined when none is built. */
export function zerolithBinary(): string | undefined
{
    const configured = process.env["ZEROLITH_BINARY_PATH"];
    if (configured !== undefined)
    {
        return configured;
    }
    const [newest] = ["release", "debug"]
        .map((profile) => join(repository, "target", profile, executable))
        .filter((path) => existsSync(path))
        .toSorted((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    return newest;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
    const binary = zerolithBinary();
    if (binary === undefined)
    {
        console.error("zerolith is not built in this checkout: run cargo build --release, or set ZEROLITH_BINARY_PATH.");
        process.exit(1);
    }
    const result = spawnSync(binary, process.argv.slice(2), { cwd: repository, stdio: "inherit" });
    process.exit(result.status ?? 1);
}
