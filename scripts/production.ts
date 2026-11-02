/**
 * Writes a package's production build into `dist/production/`. Run from the
 * package's folder after `tsc`. Each compiled module is minified on its own
 * under its own path, so an import map serves the same module graph as the
 * readable build, and keeps no comment but a legal one, since a page that
 * loads modules one by one pays for every byte of each. Its source map
 * leads back to the TypeScript source and embeds the source text, since a
 * vendored copy carries `dist/` without `src/`. A module `x.js` with an
 * `x.production.js` sibling is built from the sibling, which leaves out
 * what only development needs. A command's entry, a module that starts
 * with `#!`, is left out: its `bin` runs the readable build, and no program
 * imports it. Every module is built before any file is written, so a
 * failure leaves the previous build as it was; the files are then written
 * in place, and files the previous build had that this one does not are
 * removed.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import { minifySync, parseSync } from "rolldown/utils";

/** A source map as `tsc` writes one. */
interface CompiledMap
{
    version: number;
    file?: string;
    sourceRoot?: string;
    sources: string[];
    names: string[];
    mappings: string;
}

const root = process.cwd();
const dist = join(root, "dist");
const production = join(dist, "production");
if (!existsSync(join(root, "package.json")) || !existsSync(dist))
{
    throw new Error(`${root} is not a built package: run this from a package's folder after tsc writes dist/`);
}

const compiled = (await readdir(dist, { recursive: true }))
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => path.endsWith(".js") && !path.startsWith("production/"));
const siblings = new Set(compiled.filter((path) => path.endsWith(".production.js")));
if (compiled.length === 0)
{
    throw new Error(`${dist} holds no compiled module`);
}
const orphans = [...siblings].filter((path) => !compiled.includes(path.replace(/\.production\.js$/, ".js")));
if (orphans.length > 0)
{
    throw new Error(`${orphans.join(", ")} stand in for no module: each production sibling replaces the module of the same name`);
}

/** Every file an export entry names, under any condition, however deep. */
function targets(entry: unknown): string[]
{
    if (typeof entry === "string")
    {
        return [entry];
    }
    return entry !== null && typeof entry === "object" ? Object.values(entry).flatMap(targets) : [];
}

/** Minifies one module and returns its file and its source map's, by their paths in `dist/production/`; a command's entry gives none. */
async function build(path: string): Promise<[string, string][]>
{
    const sibling = path.replace(/\.js$/, ".production.js");
    const from = join(dist, siblings.has(sibling) ? sibling : path);
    const text = await readFile(from, "utf8");
    if (text.startsWith("#!"))
    {
        return [];
    }
    const name = basename(path);
    const code = text.replace(/\n\/\/# sourceMappingURL=[^\n]*\n?$/, "\n");
    const input = JSON.parse(await readFile(`${from}.map`, "utf8")) as CompiledMap;
    const result = minifySync(name, code, {
        module: true,
        compress: true,
        mangle: true,
        codegen: { legalComments: "inline" },
        sourcemap: true,
        inputMap: input
    });
    if (result.errors.length > 0 || result.map === undefined)
    {
        throw new Error(`${from}: ${result.errors.map((error) => error.message).join("; ") || "no source map"}`);
    }
    const output = join(production, path);
    const sources = result.map.sources.map((source) => resolve(dirname(from), input.sourceRoot ?? "", source));
    const map = {
        version: 3,
        file: name,
        sources: sources.map((source) => relative(dirname(output), source).replaceAll("\\", "/")),
        sourcesContent: await Promise.all(sources.map((source) => readFile(source, "utf8"))),
        names: result.map.names,
        mappings: result.map.mappings
    };
    return [[path, `${result.code}\n//# sourceMappingURL=${name}.map\n`], [`${path}.map`, `${JSON.stringify(map)}\n`]];
}

const files = new Map((await Promise.all(compiled.filter((path) => !siblings.has(path)).map(build))).flat());
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { exports?: Record<string, unknown> };
const missing = Object.entries(manifest.exports ?? {})
    .flatMap(([subpath, entry]) => targets(entry).map((target) => [subpath, target] as const))
    .filter(([, target]) => target.startsWith("./dist/production/") && !files.has(target.slice("./dist/production/".length)));
if (missing.length > 0)
{
    throw new Error(`${missing.map(([subpath, target]) => `${subpath} exports ${target}`).join(", ")}, which the production build does not hold; a command's entry, a module that starts with #!, is not built`);
}
const unresolved = [...files]
    .filter(([path]) => path.endsWith(".js"))
    .flatMap(([path, code]) => parseSync(path, code, { sourceType: "module" }).program.body
        .map((statement) => ("source" in statement ? statement.source?.value : undefined))
        .filter((source): source is string => typeof source === "string" && source.startsWith("."))
        .filter((source) => !files.has(posix.join(posix.dirname(path), source)))
        .map((source) => `${path} imports ${source}`));
if (unresolved.length > 0)
{
    throw new Error(`${unresolved.join(", ")}, which the production build does not hold; a command's entry, a module that starts with #!, is not built`);
}
await mkdir(production, { recursive: true });
for (const [path, text] of files)
{
    await mkdir(dirname(join(production, path)), { recursive: true });
    await writeFile(join(production, path), text);
}
const written = (await readdir(production, { recursive: true, withFileTypes: true }))
    .map((entry) => ({ path: relative(production, join(entry.parentPath, entry.name)).replaceAll("\\", "/"), folder: entry.isDirectory() }));
for (const { path } of written.filter((entry) => !entry.folder && !files.has(entry.path)))
{
    await rm(join(production, path));
}
for (const { path } of written.filter((entry) => entry.folder).toSorted((a, b) => b.path.length - a.path.length))
{
    if ((await readdir(join(production, path))).length === 0)
    {
        await rmdir(join(production, path));
    }
}
