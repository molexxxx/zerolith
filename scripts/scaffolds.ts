/**
 * Writes every project `zerolith new` can write, outside the checkout, and
 * runs each one's own `npm run check` against packages packed from the
 * checkout, so no zerolith package comes from the registry. The templates
 * and examples come from `zerolith new --help`, so a new one is covered as
 * soon as the command line offers it: each template on the command line,
 * buildless, and on Vite, the default template without the inspector, and
 * each example.
 *   ZEROLITH_BINARY_PATH=target/release/zerolith node scripts/scaffolds.ts [name...]
 * Names filter the projects, such as `tsx-vite` or `fullstack`. Exits with 1
 * when a project fails, after printing the end of its log.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

interface Project
{
    name: string;
    flags: string[];
}

const root = fileURLToPath(new URL("../", import.meta.url));
const binary = process.env["ZEROLITH_BINARY_PATH"];
if (binary === undefined || binary === "")
{
    throw new Error("ZEROLITH_BINARY_PATH names no binary; build one with cargo build --release and point it at target/release/zerolith");
}
const windows = process.platform === "win32";
/** npm's own entry when this runs under `npm run`, so npm starts without a shell on Windows. */
const npmCli = process.env["npm_execpath"];
const parallel = Number(process.env["SCAFFOLDS_PARALLEL"] ?? 3);

/** The values `zerolith new --help` lists for a flag. */
function possibleValues(help: string, flag: string): string[]
{
    const line = help.split("\n").find((entry) => entry.trimStart().startsWith(`--${flag} `)) ?? "";
    const values = /\[possible values: ([^\]]+)\]/.exec(line)?.[1];
    if (values === undefined)
    {
        throw new Error(`zerolith new --help lists no values for --${flag}`);
    }
    return values.split(",").map((value) => value.trim());
}

/** Every project to write: each template in each mode, the default template without the inspector, and each example. */
function projects(help: string): Project[]
{
    const templates = possibleValues(help, "template");
    const all: Project[] = [];
    for (const template of templates)
    {
        all.push({ name: `${template}-cli`, flags: ["--template", template] });
        all.push({ name: `${template}-buildless`, flags: ["--template", template, "--buildless"] });
        all.push({ name: `${template}-vite`, flags: ["--template", template, "--vite"] });
    }
    all.push({ name: `${templates[0]}-no-devtools`, flags: ["--template", templates[0] ?? "", "--no-devtools"] });
    for (const example of possibleValues(help, "example"))
    {
        all.push({ name: example, flags: ["--example", example] });
    }
    return all;
}

/** Runs a command in a folder, appending its output to the log, and resolves with its exit code. */
function run(command: string, args: string[], cwd: string, log: string[]): Promise<number>
{
    return new Promise((resolve) =>
    {
        log.push(`$ ${command} ${args.join(" ")}`);
        const direct = command === "npm" && npmCli !== undefined;
        const child = spawn(direct ? process.execPath : command, direct ? [npmCli, ...args] : args, { cwd, shell: windows && command === "npm" && !direct, env: { ...process.env, CI: "true" } });
        child.stdout.on("data", (chunk: Buffer) => log.push(chunk.toString()));
        child.stderr.on("data", (chunk: Buffer) => log.push(chunk.toString()));
        child.on("close", (code) => resolve(code ?? 1));
        child.on("error", (error) =>
        {
            log.push(String(error));
            resolve(1);
        });
    });
}

/** Points a project's zerolith packages at the packed tarballs, as dependencies and as overrides. */
async function useTarballs(folder: string, tarballs: Map<string, string>): Promise<void>
{
    const path = join(folder, "package.json");
    const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, Record<string, string> | undefined>;
    for (const field of ["dependencies", "devDependencies"])
    {
        const entries = manifest[field];
        for (const name of Object.keys(entries ?? {}))
        {
            const tarball = tarballs.get(name);
            if (entries !== undefined && tarball !== undefined)
            {
                entries[name] = tarball;
            }
        }
    }
    manifest["overrides"] = Object.fromEntries(tarballs);
    await writeFile(path, `${JSON.stringify(manifest, null, 4)}\n`);
}

/** Packs every workspace package and maps each package name to its tarball. */
async function pack(folder: string): Promise<Map<string, string>>
{
    await mkdir(folder, { recursive: true });
    const args = ["pack", "--workspaces", "--pack-destination", folder];
    const packed = npmCli === undefined
        ? spawnSync("npm", args, { cwd: root, shell: windows, encoding: "utf8" })
        : spawnSync(process.execPath, [npmCli, ...args], { cwd: root, encoding: "utf8" });
    if (packed.status !== 0)
    {
        throw new Error(`npm pack failed:\n${packed.stderr}`);
    }
    const tarballs = new Map<string, string>();
    for (const file of await readdir(folder))
    {
        const stem = /^(zerolith(?:-[a-z0-9-]+?)?)-\d+\.\d+\.\d+.*\.tgz$/.exec(file)?.[1];
        if (stem !== undefined)
        {
            tarballs.set(stem === "zerolith" ? "zerolith" : `@zerolith/${stem.slice("zerolith-".length)}`, `file:${join(folder, file).replaceAll("\\", "/")}`);
        }
    }
    return tarballs;
}

/** Writes, installs, and checks one project, and reports whether it passed. */
async function check(project: Project, work: string, tarballs: Map<string, string>): Promise<{ project: Project; passed: boolean; log: string[]; seconds: number; tests: number }>
{
    const start = performance.now();
    const folder = join(work, project.name);
    const log: string[] = [];
    let passed = await run(binary as string, ["new", folder, "--yes", "--no-install", ...project.flags], work, log) === 0;
    if (passed)
    {
        await useTarballs(folder, tarballs);
        passed = await run("npm", ["install", "--no-audit", "--no-fund"], folder, log) === 0
            && await run("npm", ["run", "check"], folder, log) === 0;
    }
    const tests = [...log.join("").matchAll(/Tests\s+(\d+) passed/g)].reduce((sum, match) => sum + Number(match[1]), 0);
    return { project, passed, log, seconds: Math.round((performance.now() - start) / 1000), tests };
}

const help = spawnSync(binary, ["new", "--help"], { encoding: "utf8" }).stdout;
const filter = process.argv.slice(2);
const chosen = projects(help).filter((project) => filter.length === 0 || filter.includes(project.name));
const work = await mkdtemp(join(tmpdir(), "zerolith-scaffolds-"));
const tarballs = await pack(join(work, "tarballs"));
console.log(`${tarballs.size} packages packed; checking ${chosen.length} projects in ${work}`);

const results: Awaited<ReturnType<typeof check>>[] = [];
const queue = [...chosen];
await Promise.all(Array.from({ length: Math.max(1, parallel) }, async () =>
{
    for (let project = queue.shift(); project !== undefined; project = queue.shift())
    {
        const result = await check(project, work, tarballs);
        console.log(`${result.passed ? "pass" : "FAIL"}  ${project.name}  (${project.flags.join(" ")})  ${result.tests} tests, ${result.seconds} s`);
        results.push(result);
    }
}));

const failed = results.filter((result) => !result.passed);
for (const { project, log } of failed)
{
    console.log(`\n${project.name} failed; the end of its log:\n${log.join("").split("\n").slice(-60).join("\n")}`);
}
if (failed.length === 0)
{
    await rm(work, { recursive: true, force: true });
}
console.log(`\n${results.length - failed.length} of ${results.length} projects passed`);
process.exitCode = failed.length === 0 ? 0 : 1;
