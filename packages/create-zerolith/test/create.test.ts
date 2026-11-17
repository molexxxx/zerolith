import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * `create-zerolith` against a stand-in for the native binary. The command
 * line's launcher runs whatever ZEROLITH_BINARY_PATH names, so these tests
 * name Node itself and put a script called `new` in the folder they run
 * in: Node runs that script with the arguments after `new`, and the script
 * records them and exits with the code a file holds. That the script runs
 * at all shows `new` came first. No project is written and no binary is
 * built; create.cli.test.ts runs the real one.
 */

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const built = join(packageRoot, "dist", "bin.js");
const root = join(repository, "target", `create-${process.pid}`);
const recorded = join(root, "args.json");

const STAND_IN = `const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
writeFileSync(join(__dirname, "args.json"), JSON.stringify(process.argv.slice(2)));
process.exit(Number(readFileSync(join(__dirname, "exit.txt"), "utf8")));
`;

interface Manifest
{
    version: string;
    bin?: Record<string, string>;
    files?: string[];
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
}

/** Runs the built launcher in `cwd` with Node standing in for the binary, and returns its exit code and what it printed. */
function create(args: string[], cwd: string = root, script: string = built): { status: number | null; output: string }
{
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env))
    {
        if (!["node_path", "zerolith_binary_path"].includes(key.toLowerCase()))
        {
            env[key] = value;
        }
    }
    env["ZEROLITH_BINARY_PATH"] = process.execPath;
    const result = spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: "utf8", windowsHide: true });
    if (result.error !== undefined)
    {
        throw result.error;
    }
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** The arguments the stand-in was run with, after `new`. */
function ran(): string[]
{
    return JSON.parse(readFileSync(recorded, "utf8")) as string[];
}

beforeEach(() =>
{
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "package.json"), "{ \"type\": \"commonjs\" }\n");
    writeFileSync(join(root, "new"), STAND_IN);
    writeFileSync(join(root, "exit.txt"), "0");
});

afterAll(() =>
{
    rmSync(root, { recursive: true, force: true });
});

describe("create-zerolith", () =>
{
    it("runs zerolith new with its arguments, each as it was written", () =>
    {
        const args = [
            "my app",
            "--template",
            "ts",
            "--yes",
            "a\"b",
            "it's",
            "x; echo y",
            "$(id)",
            "`id`",
            "%PATH%",
            "a&b|c>d<e",
            "back\\slash\\",
            "tab\there",
            `caf${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x1f9ea)}`,
            "",
            "--",
            "-x",
            "../outside"
        ];
        const { status, output } = create(args);
        expect(output).toBe("");
        expect(status).toBe(0);
        expect(ran()).toEqual(args);
    });

    it("runs zerolith new alone when it is given nothing", () =>
    {
        expect(create([]).status).toBe(0);
        expect(ran()).toEqual([]);
    });

    it("exits with the status zerolith new exits with", () =>
    {
        for (const code of [1, 2, 7])
        {
            writeFileSync(join(root, "exit.txt"), String(code));
            expect(create(["my-app"]).status, String(code)).toBe(code);
        }
    });

    it("says what to run when the command line is not installed beside it", () =>
    {
        const alone = mkdtempSync(join(tmpdir(), "create-zerolith-"));
        try
        {
            writeFileSync(join(alone, "package.json"), "{ \"type\": \"module\" }\n");
            copyFileSync(built, join(alone, "bin.js"));
            const { status, output } = create(["my-app"], alone, join(alone, "bin.js"));
            expect(status).toBe(1);
            expect(output).toContain("create-zerolith could not find @zerolith/cli");
            expect(output).toContain("Run `npx @zerolith/cli new` instead");
            expect(existsSync(join(alone, "my-app"))).toBe(false);
        }
        finally
        {
            rmSync(alone, { recursive: true, force: true });
        }
    });
});

describe("the create-zerolith package", () =>
{
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as Manifest;

    it("depends on the command line alone, at its own version, and runs nothing on install", () =>
    {
        expect(manifest.dependencies).toEqual({ "@zerolith/cli": manifest.version });
        expect(manifest.peerDependencies).toBeUndefined();
        expect(manifest.optionalDependencies).toBeUndefined();
        const scripts = Object.keys(manifest.scripts ?? {});
        for (const hook of ["preinstall", "install", "postinstall", "prepare"])
        {
            expect(scripts).not.toContain(hook);
        }
    });

    it("is one command and holds no template of its own", () =>
    {
        expect(manifest.bin).toEqual({ "create-zerolith": "dist/bin.js" });
        expect(manifest.files?.toSorted()).toEqual(["LICENSE", "README.md", "dist", "src"]);
        expect(readdirSync(join(packageRoot, "src"))).toEqual(["bin.ts"]);
    });
});
