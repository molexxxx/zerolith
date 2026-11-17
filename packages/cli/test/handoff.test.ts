import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { HANDED_OFF, type Project, projectCopy } from "../src/index.ts";

/**
 * A copy of the command line hands a command to the project's own copy, as
 * Angular's ng does: first the choice of copy, against a file system held in
 * memory, then the built launcher end to end, with Node standing in for both
 * the binary and the project's copy, as create-zerolith's tests do.
 */

/** A file system of the given files, by absolute path, where each link folder stands for the folder it names. */
function fileSystem(contents: Record<string, string>, links: Record<string, string> = {}): Pick<Project, "read" | "real">
{
    const real = (path: string): string | undefined =>
    {
        let target = resolve(path);
        for (const [link, to] of Object.entries(links))
        {
            if (target === link || target.startsWith(`${link}${sep}`))
            {
                target = `${to}${target.slice(link.length)}`;
            }
        }
        return Object.keys(contents).some((file) => file === target || file.startsWith(`${target}${sep}`)) ? target : undefined;
    };
    return { read: (path) => contents[real(path) ?? ""], real };
}

const own = { folder: resolve("/global/node_modules/@zerolith/cli"), version: "1.13.0" };
const app = resolve("/work/app");
const copy = join(app, "node_modules", "@zerolith", "cli");

/** The manifest of the project's copy, with `fields` over a release of 1.12.0. */
function manifest(fields: Record<string, unknown> = {}): string
{
    return JSON.stringify({ name: "@zerolith/cli", version: "1.12.0", bin: { zerolith: "dist/bin.js" }, ...fields });
}

/** The files of this copy and of a project whose copy has `text` as its manifest, and a launcher. */
function files(text: string = manifest()): Record<string, string>
{
    return {
        [join(own.folder, "package.json")]: "{}",
        [join(own.folder, "dist", "bin.js")]: "",
        [join(copy, "package.json")]: text,
        [join(copy, "dist", "bin.js")]: "",
        [join(app, "src", "main.ts")]: ""
    };
}

/** The files of a project whose copy is at `version`. */
function at(version: string): Pick<Project, "read" | "real">
{
    return fileSystem(files(manifest({ version })));
}

/** The choice for `args` run in `cwd`, over the files given. */
function choose(args: string[], cwd: string = join(app, "src"), system: Pick<Project, "read" | "real"> = fileSystem(files()), handedOff: boolean = false): ReturnType<typeof projectCopy>
{
    return projectCopy({ args, cwd, own, handedOff, ...system });
}

describe("projectCopy", () =>
{
    it("hands every command but new to the project's copy, found from any folder inside the project", () =>
    {
        const expected = { launcher: join(copy, "dist", "bin.js"), version: "1.12.0" };
        for (const args of [["build"], ["dev", "--port", "5000"], ["doctor", "."], ["--version"], ["-V"], ["--help"], ["help", "build"], []])
        {
            expect(choose(args), args.join(" ")).toEqual(expected);
        }
        expect(choose(["build"], app)).toEqual(expected);
        expect(choose(["build"], join(app, "src", "components", "deep"))).toEqual(expected);
        expect(choose(["new", "my-app"])).toBeUndefined();
        expect(choose(["new"])).toBeUndefined();
    });

    it("runs a command itself outside a project, in its own copy, at its own version, and when handed the command", () =>
    {
        expect(choose(["build"], resolve("/elsewhere"))).toBeUndefined();
        expect(choose(["build"], join(app, "src"), fileSystem(files(manifest({ version: "1.13.0" }))))).toBeUndefined();
        expect(choose(["build"], join(app, "src"), fileSystem(files(), { [copy]: own.folder }))).toBeUndefined();
        expect(choose(["build"], join(app, "src"), fileSystem(files()), true)).toBeUndefined();
    });

    it("runs a command itself when the project's copy is older than the command", () =>
    {
        expect(choose(["add", "forms"], app, at("1.11.0"))).toBeUndefined();
        expect(choose(["upgrade"], app, at("1.11.0"))).toBeUndefined();
        expect(choose(["upgrade"], app, at("1.12.0-alpha.1"))).toBeUndefined();
        expect(choose(["lint"], app, at("1.5.0"))).toBeUndefined();
        expect(choose(["build"], app, at("1.5.0"))?.version).toBe("1.5.0");
        expect(choose(["lint"], app, at("1.6.0"))?.version).toBe("1.6.0");
        expect(choose(["add", "forms"], app, at("1.12.0"))?.version).toBe("1.12.0");
        expect(choose(["upgrade"], app, at("2.0.0"))?.version).toBe("2.0.0");
        for (const command of ["__proto__", "constructor", "toString", "hasOwnProperty"])
        {
            expect(choose([command], app, at("1.12.0"))?.version, command).toBe("1.12.0");
        }
    });

    it("runs upgrade with the newer of the two copies, so a fix to upgrade reaches a project on an earlier release", () =>
    {
        expect(choose(["upgrade"], app, at("1.12.1"))).toBeUndefined();
        expect(choose(["upgrade", "--dry-run"], app, at("1.12.0"))).toBeUndefined();
        expect(choose(["upgrade"], app, at("1.13.0-beta.1"))).toBeUndefined();
        expect(choose(["upgrade"], app, at("1.13.1"))?.version).toBe("1.13.1");
        expect(choose(["upgrade", "2.0.0", "--major"], app, at("1.14.0"))?.version).toBe("1.14.0");
        expect(choose(["add", "forms"], app, at("1.12.1"))?.version).toBe("1.12.1");
        expect(choose(["build"], app, at("1.12.1"))?.version).toBe("1.12.1");
    });

    it("takes the nearest copy, so a project inside another runs its own", () =>
    {
        const web = join(app, "packages", "web");
        const inner = join(web, "node_modules", "@zerolith", "cli");
        const system = fileSystem({
            ...files(),
            [join(inner, "package.json")]: manifest({ version: "1.10.0" }),
            [join(inner, "dist", "bin.js")]: "",
            [join(web, "src", "main.ts")]: ""
        });
        expect(choose(["build"], join(web, "src"), system)).toEqual({ launcher: join(inner, "dist", "bin.js"), version: "1.10.0" });
        expect(choose(["build"], join(app, "src"), system)?.version).toBe("1.12.0");
    });

    it("runs a command itself rather than trust a copy it cannot read as one", () =>
    {
        const outside = resolve("/work/evil.js");
        for (const [label, text] of [
            ["not JSON", "{ \"name\": "],
            ["not an object", "\"@zerolith/cli\""],
            ["another package", manifest({ name: "@zerolith/cli-evil" })],
            ["no version", manifest({ version: undefined })],
            ["a version that is not one", manifest({ version: "latest" })],
            ["a version with more after it", manifest({ version: "1.12.0 && echo x" })],
            ["no bin", manifest({ bin: undefined })],
            ["a bin named for the package alone", manifest({ bin: "dist/bin.js" })],
            ["a bin for another command", manifest({ bin: { other: "dist/bin.js" } })],
            ["a bin that leaves its folder", manifest({ bin: { zerolith: "../../../evil.js" } })],
            ["a bin by an absolute path", manifest({ bin: { zerolith: outside } })],
            ["a bin that is not a script", manifest({ bin: { zerolith: "dist/zerolith.exe" } })],
            ["a bin that is not there", manifest({ bin: { zerolith: "dist/missing.js" } })]
        ] as const)
        {
            const system = fileSystem({ ...files(text), [outside]: "", [join(copy, "dist", "zerolith.exe")]: "" });
            expect(choose(["build"], app, system), label).toBeUndefined();
        }
        const linked = fileSystem({ ...files(), [join(resolve("/work/elsewhere"), "bin.js")]: "" }, { [join(copy, "dist")]: resolve("/work/elsewhere") });
        expect(choose(["build"], app, linked), "a bin whose real path leaves the copy").toBeUndefined();
    });
});

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const launcher = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const ownVersion = (JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { version: string }).version;
const root = join(repository, "target", `handoff-${process.pid}`);
const project = join(root, "project");
const records = join(root, "records.jsonl");

/** A script that records who ran, with what, and whether it was handed the command, then exits with the code exit.txt holds. */
const RECORDER = (who: string): string => `const { appendFileSync, readFileSync } = require("node:fs");
const { basename } = require("node:path");
appendFileSync(${JSON.stringify(records)}, JSON.stringify({ who: ${JSON.stringify(who)}, script: basename(__filename), args: process.argv.slice(2), handedOff: process.env[${JSON.stringify(HANDED_OFF)}] ?? null }) + "\\n");
process.exit(Number(readFileSync(${JSON.stringify(join(root, "exit.txt"))}, "utf8")));
`;

interface Ran
{
    who: string;
    script: string;
    args: string[];
    handedOff: string | null;
}

/** Writes the project's copy of the command line at `version`, whose launcher records its runs. */
function projectAt(version: string): void
{
    const copyFolder = join(project, "node_modules", "@zerolith", "cli");
    mkdirSync(join(copyFolder, "dist"), { recursive: true });
    writeFileSync(join(copyFolder, "package.json"), JSON.stringify({ name: "@zerolith/cli", version, bin: { zerolith: "dist/bin.js" } }));
    writeFileSync(join(copyFolder, "dist", "bin.js"), RECORDER("project"));
}

/** Runs the built launcher in `cwd` with Node as its binary, and returns its exit code, what it printed, and what ran. */
function zerolith(args: string[], cwd: string = project, extra: NodeJS.ProcessEnv = {}): { status: number | null; stderr: string; ran: Ran[] }
{
    rmSync(records, { force: true });
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env))
    {
        if (!["zerolith_binary_path", HANDED_OFF.toLowerCase(), "node_options"].includes(key.toLowerCase()))
        {
            env[key] = value;
        }
    }
    const result = spawnSync(process.execPath, [launcher, ...args], { cwd, env: { ...env, ZEROLITH_BINARY_PATH: process.execPath, ...extra }, encoding: "utf8", windowsHide: true });
    if (result.error !== undefined)
    {
        throw result.error;
    }
    const ran = existsSync(records) ? readFileSync(records, "utf8").split("\n").filter((line) => line !== "").map((line) => JSON.parse(line) as Ran) : [];
    return { status: result.status, stderr: result.stderr, ran };
}

beforeEach(() =>
{
    rmSync(root, { recursive: true, force: true });
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(root, "exit.txt"), "0");
    writeFileSync(join(project, "package.json"), "{ \"name\": \"app\", \"type\": \"commonjs\" }\n");
    for (const script of ["new", "build", "upgrade", "add"])
    {
        writeFileSync(join(project, script), RECORDER("own"));
    }
    projectAt("9.9.9");
});

afterAll(() =>
{
    rmSync(root, { recursive: true, force: true });
});

describe("the launcher", () =>
{
    it("hands a command to the project's copy with the arguments as written, says so, and exits with its status", () =>
    {
        writeFileSync(join(root, "exit.txt"), "3");
        const args = ["build", "my app", "--base", "/app/", "a\"b", "it's", "x; echo y", "$(id)", "%PATH%", "back\\slash\\", "", `caf${String.fromCodePoint(0xe9)}`];
        const { status, stderr, ran } = zerolith(args);
        expect(ran).toEqual([{ who: "project", script: "bin.js", args, handedOff: "1" }]);
        expect(status).toBe(3);
        expect(stderr).toContain(`zerolith ${ownVersion} is running the project's own command line, 9.9.9`);
    });

    it("finds the project's copy from a folder inside the project", () =>
    {
        const { ran } = zerolith(["doctor", "."], join(project, "src"));
        expect(ran).toEqual([{ who: "project", script: "bin.js", args: ["doctor", "."], handedOff: "1" }]);
    });

    it("runs new itself, and does not pass on that another copy handed it a command", () =>
    {
        const started = zerolith(["new", "my-app"]);
        expect(started.ran).toEqual([{ who: "own", script: "new", args: ["my-app"], handedOff: null }]);
        expect(started.stderr).not.toContain("is running the project's own command line");
        const handed = zerolith(["build"], project, { [HANDED_OFF]: "1" });
        expect(handed.ran).toEqual([{ who: "own", script: "build", args: [], handedOff: null }]);
    });

    it("hands upgrade only to a project's copy newer than itself", () =>
    {
        expect(zerolith(["upgrade", "--dry-run"]).ran).toEqual([{ who: "project", script: "bin.js", args: ["upgrade", "--dry-run"], handedOff: "1" }]);
        projectAt("1.0.0");
        expect(zerolith(["upgrade", "--dry-run"]).ran).toEqual([{ who: "own", script: "upgrade", args: ["--dry-run"], handedOff: null }]);
    });

    it("runs add and upgrade itself for a project whose copy is older than both", () =>
    {
        projectAt("1.11.0");
        expect(zerolith(["upgrade"]).ran).toEqual([{ who: "own", script: "upgrade", args: [], handedOff: null }]);
        expect(zerolith(["add", "forms"]).ran).toEqual([{ who: "own", script: "add", args: ["forms"], handedOff: null }]);
        expect(zerolith(["build"]).ran.map((record) => record.who)).toEqual(["project"]);
    });

    it("runs a command itself outside any project", () =>
    {
        const outside = mkdtempSync(join(tmpdir(), "zerolith-handoff-"));
        try
        {
            writeFileSync(join(outside, "package.json"), "{ \"type\": \"commonjs\" }\n");
            writeFileSync(join(outside, "build"), RECORDER("own"));
            expect(zerolith(["build"], outside).ran).toEqual([{ who: "own", script: "build", args: [], handedOff: null }]);
        }
        finally
        {
            rmSync(outside, { recursive: true, force: true });
        }
        expect(dirname(launcher)).toContain("dist");
    });
});
