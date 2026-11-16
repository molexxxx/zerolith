import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { binary } from "./helpers.ts";

/**
 * `zerolith add` and `zerolith upgrade` against a package manager that
 * stands in for npm: a script first on PATH that records its arguments and
 * exits with the code a file holds, so the tests see what the commands
 * write to package.json, what they run, and what a failed install leaves,
 * with no registry. Lives under this repository's target folder.
 */

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const root = join(repository, "target", `packages-${process.pid}`);
const project = join(root, "project");
const tools = join(root, "tools");
const calls = join(tools, "calls.txt");

const MANIFEST = `{
    "name": "app",
    "private": true,
    "dependencies": {
        "@zerolith/router": "1.11.0",
        "zerolith": "1.11.0"
    },
    "devDependencies": {
        "@zerolith/cli": "1.11.0",
        "other": "1.0.0"
    }
}
`;

/** The environment with the stand-in's folder first on the path, and no word of the package manager that runs the tests. */
function environment(): NodeJS.ProcessEnv
{
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env))
    {
        if (key.toLowerCase() !== "path" && key.toLowerCase() !== "npm_config_user_agent")
        {
            env[key] = value;
        }
    }
    env["PATH"] = `${tools}${delimiter}${process.env["PATH"] ?? ""}`;
    env["NO_COLOR"] = "1";
    return env;
}

/** Runs the command line in the project and returns its exit code and everything it printed. */
function zerolith(args: string[], cwd: string = project): { status: number | null; output: string }
{
    const result = spawnSync(binary(), args, { cwd, env: environment(), encoding: "utf8", windowsHide: true });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** What the stand-in was run with, one run a line. */
function ran(): string[]
{
    return existsSync(calls) ? readFileSync(calls, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "") : [];
}

const manifest = (): string => readFileSync(join(project, "package.json"), "utf8");

beforeEach(() =>
{
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(project, "src"), { recursive: true });
    mkdirSync(tools, { recursive: true });
    writeFileSync(join(project, "package.json"), MANIFEST);
    writeFileSync(join(project, "package-lock.json"), "{}");
    writeFileSync(join(tools, "exit.txt"), "0");
    if (process.platform === "win32")
    {
        writeFileSync(join(tools, "npm.cmd"), "@echo off\r\necho %*>>\"%~dp0calls.txt\"\r\nset /p code=<\"%~dp0exit.txt\"\r\nexit /b %code%\r\n");
    }
    else
    {
        writeFileSync(join(tools, "npm"), "#!/bin/sh\necho \"$@\" >> \"$(dirname \"$0\")/calls.txt\"\nexit \"$(cat \"$(dirname \"$0\")/exit.txt\")\"\n");
        chmodSync(join(tools, "npm"), 0o755);
    }
});

afterAll(() =>
{
    rmSync(root, { recursive: true, force: true });
});

describe("zerolith add", () =>
{
    it("lists each package at the project's version in the list it belongs to, keeps the rest of package.json, and installs once", () =>
    {
        const { status, output } = zerolith(["add", "forms", "@zerolith/test", "forms"]);
        expect(output).toMatch(/added\s+@zerolith\/forms 1\.11\.0: import from "@zerolith\/forms", guide https:\/\/zerolith\.dev\/guide\/forms\//);
        expect(status).toBe(0);
        expect(manifest()).toBe(MANIFEST
            .replace("        \"@zerolith/router\"", "        \"@zerolith/forms\": \"1.11.0\",\n        \"@zerolith/router\"")
            .replace("        \"other\"", "        \"@zerolith/test\": \"1.11.0\",\n        \"other\""));
        expect(ran()).toEqual(["install"]);
    });

    it("prints what it would do with --dry-run and changes nothing", () =>
    {
        const { status, output } = zerolith(["add", "state", "--dry-run"]);
        expect(status).toBe(0);
        expect(output).toMatch(/would set\s+@zerolith\/state 1\.11\.0 in dependencies, new/);
        expect(output).toMatch(/would run\s+npm install/);
        expect(manifest()).toBe(MANIFEST);
        expect(ran()).toEqual([]);
    });

    it("refuses a name that is not a zerolith package before it changes anything", () =>
    {
        for (const name of ["left-pad", "forms@2.0.0", "forms && echo x", "../forms"])
        {
            const { status, output } = zerolith(["add", "forms", name]);
            expect(status, name).toBe(1);
            expect(output, name).toContain("is not a zerolith package; the packages are zerolith, a11y, browser");
        }
        expect(manifest()).toBe(MANIFEST);
        expect(ran()).toEqual([]);
    });

    it("puts package.json back when the install fails", () =>
    {
        writeFileSync(join(tools, "exit.txt"), "1");
        const { status, output } = zerolith(["add", "forms"]);
        expect(status).toBe(1);
        expect(output).toContain("npm install did not finish, so package.json is put back as it was");
        expect(manifest()).toBe(MANIFEST);
        expect(ran()).toEqual(["install"]);
    });

    it("finds the project from a folder inside it and says which package.json it took", () =>
    {
        const { status, output } = zerolith(["add", "forms", "--root", "src", "--dry-run"]);
        expect(status).toBe(0);
        expect(output).toContain("the nearest package.json");
        expect(output).toMatch(/would set\s+@zerolith\/forms 1\.11\.0/);
    });
});

describe("zerolith upgrade", () =>
{
    it("moves every zerolith package the project lists in one edit, and nothing else", () =>
    {
        const { status, output } = zerolith(["upgrade", "1.12.0", "--dry-run"]);
        expect(status).toBe(0);
        for (const name of ["zerolith", "@zerolith/cli", "@zerolith/router"])
        {
            expect(output).toContain(`${name} 1.12.0 in`);
        }
        expect(output).not.toContain("other");
        expect(output).toMatch(/would run\s+zerolith doctor/);
        expect(manifest()).toBe(MANIFEST);
        expect(ran()).toEqual([]);
    });

    it("puts package.json back when the install fails", () =>
    {
        writeFileSync(join(tools, "exit.txt"), "1");
        const { status, output } = zerolith(["upgrade", "1.12.0"]);
        expect(status).toBe(1);
        expect(output).toContain("package.json is put back as it was");
        expect(manifest()).toBe(MANIFEST);
        expect(ran()).toEqual(["install"]);
    });

    it("refuses a new major version without --major", () =>
    {
        const refused = zerolith(["upgrade", "2.0.0"]);
        expect(refused.status).toBe(1);
        expect(refused.output).toContain("2.0.0 is a new major version");
        expect(refused.output).toContain("--major");
        expect(ran()).toEqual([]);
        const allowed = zerolith(["upgrade", "2.0.0", "--major", "--dry-run"]);
        expect(allowed.status).toBe(0);
        expect(allowed.output).toMatch(/would set\s+zerolith 2\.0\.0 in dependencies, from 1\.11\.0/);
        expect(manifest()).toBe(MANIFEST);
    });

    it("refuses a version that is not one, and a registry answer that is not one", () =>
    {
        for (const version of ["1.12.0 && echo x", "latest", "^1.12.0", "1.12", "../1.12.0"])
        {
            const { status, output } = zerolith(["upgrade", version]);
            expect(status, version).toBe(1);
            expect(output, version).toContain("is not a version");
        }
        expect(ran()).toEqual([]);
        const { status, output } = zerolith(["upgrade"]);
        expect(status).toBe(1);
        expect(output).toContain("name the version, as in zerolith upgrade");
        expect(ran()).toEqual(["view zerolith version"]);
        expect(manifest()).toBe(MANIFEST);
    });
});
