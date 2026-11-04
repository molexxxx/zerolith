/**
 * Writes a package's production build into `dist/production/`. Run from the
 * package's folder after `tsc`. Each compiled module is minified on its own
 * under its own path, so an import map serves the same module graph as the
 * readable build, and keeps no comment but a legal one, since a page that
 * loads modules one by one pays for every byte of each. Its source map
 * leads back to the TypeScript source and embeds the source text, since a
 * vendored copy carries `dist/` without `src/`. A module `x.js` with an
 * `x.production.js` sibling is built from the sibling, which leaves out
 * what only development needs. A module `x.js` with a folder `x/` beside
 * it is bundled with the folder's modules into one, since the folder is
 * its private part, which only it imports; the folder is not emitted, so
 * a page loads one module and the names that cross the folder's files are
 * minified as the names inside one file are. A command's entry, a module
 * that starts with `#!`, is left out: its `bin` runs the readable build,
 * and no program imports it. Every module is built before any file is
 * written, so a failure leaves the previous build as it was; the files are
 * then written in place, and files the previous build had that this one
 * does not are removed.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, relative, resolve, sep } from "node:path";
import { RolldownMagicString, rolldown } from "rolldown";
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

/** The folder of private modules beside a module, as a path prefix: `x/` for `x.js`. */
function folderOf(path: string): string
{
    return path.replace(/\.js$/, "/");
}

/** The modules with a folder of private modules beside them, each bundled with its folder. */
const parents = new Set(compiled.filter((path) => !siblings.has(path) && compiled.some((other) => other.startsWith(folderOf(path)))));

/** The modules in a parent's folder, each with the outermost parent whose folder holds it, which bundles it; a parent in another's folder is bundled into that one. */
const owned = new Map(compiled.flatMap((path) =>
{
    const owners = [...parents].filter((parent) => path.startsWith(folderOf(parent))).toSorted((a, b) => a.length - b.length);
    return owners.length === 0 ? [] : [[path, owners[0] as string] as const];
}));

/** The relative imports of a compiled module, resolved to paths in `dist/`. */
async function importsOf(path: string): Promise<string[]>
{
    const code = await readFile(join(dist, path), "utf8");
    return parseSync(path, code, { sourceType: "module" }).program.body
        .map((statement) => ("source" in statement ? statement.source?.value : undefined))
        .filter((source): source is string => typeof source === "string" && source.startsWith("."))
        .map((source) => posix.join(posix.dirname(path), source));
}

const trespasses = (await Promise.all(compiled.filter((path) => !siblings.has(path)).map(async (path) => (await importsOf(path))
    .filter((target) => owned.has(target) && owned.get(target) !== path && owned.get(target) !== owned.get(path))
    .map((target) => `${path} imports ${target}, which only ${owned.get(target) as string} and its folder may`)))).flat();
if (trespasses.length > 0)
{
    throw new Error(`${trespasses.join("; ")}: a folder beside a module is its private part`);
}

/** A top-level statement of a bundled module, as far as the export marking reads it. */
interface Statement
{
    type: string;
    start: number;
    end: number;
    id?: { name: string } | null;
    declaration?: unknown;
    source?: unknown;
    declarations?: { id: { type: string; name?: string } }[];
    specifiers?: { start: number; end: number; local: { name: string }; exported: { name?: string } }[];
}

/**
 * Marks a bundled module's exports on their declarations, `export function html` for `function html` with `export { html }` at the end as the bundler
 * writes it, since the minifier keeps the name of an exported declaration, as it does in a module `tsc` wrote, but renames a binding an export list
 * names and aliases it in the list, which a consumer's unminified build then shows. A name exported under another stays in the list.
 */
function exportsInPlace(code: string): { code: string; map: string } | null
{
    const body = parseSync("bundle.js", code, { sourceType: "module" }).program.body as unknown as Statement[];
    const list = body.find((statement) => statement.type === "ExportNamedDeclaration" && statement.declaration === null && statement.source === null);
    if (list?.specifiers === undefined)
    {
        return null;
    }
    const declared = new Map<string, Statement>();
    for (const statement of body)
    {
        const declarator = statement.declarations?.length === 1 ? statement.declarations[0]?.id : undefined;
        const name = statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration" ? statement.id?.name : declarator?.type === "Identifier" ? declarator.name : undefined;
        if (name !== undefined)
        {
            declared.set(name, statement);
        }
    }
    const magic = new RolldownMagicString(code);
    const kept: string[] = [];
    for (const specifier of list.specifiers)
    {
        const statement = specifier.local.name === specifier.exported.name ? declared.get(specifier.local.name) : undefined;
        if (statement === undefined)
        {
            kept.push(code.slice(specifier.start, specifier.end));
            continue;
        }
        magic.prependLeft(statement.start, "export ");
    }
    if (kept.length === list.specifiers.length)
    {
        return null;
    }
    if (kept.length === 0)
    {
        magic.remove(list.start, list.end);
    }
    else
    {
        magic.overwrite(list.start, list.end, `export { ${kept.join(", ")} };`);
    }
    return { code: magic.toString(), map: magic.generateMap({ hires: true }).toString() };
}

/** Bundles a module with the modules of its folder into one, imports from outside the folder left as they are, and returns the module's code and its map onto the TypeScript sources, as `tsc` writes one beside a compiled module. */
async function bundled(path: string): Promise<{ code: string; map: CompiledMap }>
{
    const entry = join(dist, path);
    const folder = join(dist, folderOf(path).slice(0, -1)) + sep;
    const bundle = await rolldown({
        input: entry,
        cwd: dist,
        plugins: [{
            name: "folder",
            resolveId(source, importer): string | { id: string; external: true }
            {
                if (importer === undefined)
                {
                    return source;
                }
                if (!source.startsWith("."))
                {
                    return { id: source, external: true };
                }
                const target = resolve(dirname(importer), source);
                return target.startsWith(folder) ? target : { id: `./${relative(dirname(entry), target).replaceAll("\\", "/")}`, external: true };
            },
            async load(id): Promise<{ code: string; map: CompiledMap }>
            {
                const text = await readFile(id, "utf8");
                return { code: text.replace(/\n\/\/# sourceMappingURL=[^\n]*\n?$/, "\n"), map: JSON.parse(await readFile(`${id}.map`, "utf8")) as CompiledMap };
            },
            renderChunk(code): { code: string; map: string } | null
            {
                return exportsInPlace(code);
            }
        }]
    });
    try
    {
        const { output } = await bundle.generate({ format: "esm", dir: dist, entryFileNames: basename(path), sourcemap: true, minify: false });
        const chunks = output.filter((item) => item.type === "chunk");
        const chunk = chunks[0];
        if (chunks.length !== 1 || chunk === undefined || chunk.map === null || chunk.map === undefined)
        {
            throw new Error(`${path}: bundling its folder gave ${chunks.length} module(s) instead of one with a source map`);
        }
        const sources = chunk.map.sources.map((source) => relative(dist, resolve(dist, source)).replaceAll("\\", "/"));
        return { code: chunk.code, map: { version: 3, file: basename(path), sources, names: chunk.map.names, mappings: chunk.map.mappings } };
    }
    finally
    {
        await bundle.close();
    }
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

/** Minifies one module, bundled with its folder when it has one, and returns its file and its source map's, by their paths in `dist/production/`; a command's entry gives none. */
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
    const { code, map: input } = parents.has(path)
        ? await bundled(path)
        : { code: text.replace(/\n\/\/# sourceMappingURL=[^\n]*\n?$/, "\n"), map: JSON.parse(await readFile(`${from}.map`, "utf8")) as CompiledMap };
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

const files = new Map((await Promise.all(compiled.filter((path) => !siblings.has(path) && !owned.has(path)).map(build))).flat());
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
