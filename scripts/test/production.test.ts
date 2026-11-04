/**
 * The production builds the packages publish, which a page behind an import
 * map loads as they are: every module of the readable build except a
 * command's entry, minified under the same path, keeping no comment but the
 * one that names its source map, exporting the same names, with a source map
 * that embeds the TypeScript source and leads each string back to it; and
 * each package entry maps `development` to the readable build and `default`
 * to the production build. Runs after `npm run build`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { SourceMap } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "rolldown/utils";
import { describe, expect, it } from "vitest";

const packages = fileURLToPath(new URL("../../packages/", import.meta.url));
const PUBLISHED = ["zerolith", "router", "a11y", "forms", "client", "i18n", "devtools", "otel"];

interface Manifest
{
    exports: Record<string, string | Record<string, string>>;
}

interface Payload
{
    version: number;
    file: string;
    sources: string[];
    sourcesContent?: string[];
    names: string[];
    mappings: string;
}

/** A node of the syntax tree `parseSync` returns, as far as these checks read it. */
interface Node
{
    type: string;
    start: number;
    [key: string]: unknown;
}

/** What the checks read from a module's syntax tree: its strings and arrays of strings by where each starts, and what the initializer of each variable declared under a name holds. */
interface Strings
{
    strings: { value: string; start: number }[];
    arrays: Map<number, string[]>;
    declared: Map<string, Strings[]>;
}

function manifest(name: string): Manifest
{
    return JSON.parse(readFileSync(join(packages, name, "package.json"), "utf8")) as Manifest;
}

/** The readable module a production module is built from: its production sibling where there is one. */
function readable(name: string, path: string): string
{
    const dist = join(packages, name, "dist");
    const sibling = path.replace(/\.js$/, ".production.js");
    return readFileSync(join(dist, existsSync(join(dist, sibling)) ? sibling : path), "utf8");
}

/** The compiled modules a production build is made from, as paths under `dist/`: every module except a production sibling, a command's entry, judged by the file the build reads, and a module in the folder beside another, which that module is bundled with. */
function compiled(name: string): string[]
{
    const modules = readdirSync(join(packages, name, "dist"), { recursive: true })
        .map((path) => String(path).replaceAll("\\", "/"))
        .filter((path) => path.endsWith(".js") && !path.endsWith(".production.js") && !path.startsWith("production/"))
        .filter((path) => !readable(name, path).startsWith("#!"))
        .toSorted();
    const folders = modules.map((path) => path.replace(/\.js$/, "/"));
    return modules.filter((path) => !folders.some((folder) => path.startsWith(folder)));
}

function parse(file: string, code: string): { program: Node; comments: { value: string }[] }
{
    const result = parseSync(file, code, { sourceType: "module" });
    expect(result.errors).toEqual([]);
    return result as unknown as { program: Node; comments: { value: string }[] };
}

/** Calls `visit` on every node of a syntax tree. */
function walk(node: unknown, visit: (node: Node) => void): void
{
    if (Array.isArray(node))
    {
        node.forEach((item) => walk(item, visit));
        return;
    }
    if (node === null || typeof node !== "object" || typeof (node as Node).type !== "string")
    {
        return;
    }
    visit(node as Node);
    for (const [key, value] of Object.entries(node))
    {
        if (key !== "start" && key !== "end")
        {
            walk(value, visit);
        }
    }
}

/** The value of a string literal or of a template without expressions. */
function stringOf(node: Node): string | undefined
{
    if (node.type === "Literal" && typeof node["value"] === "string")
    {
        return node["value"];
    }
    const quasis = node["quasis"] as { value: { cooked: string } }[] | undefined;
    const expressions = node["expressions"] as unknown[] | undefined;
    return node.type === "TemplateLiteral" && expressions?.length === 0 ? quasis?.[0]?.value.cooked : undefined;
}

/** The strings, the string arrays, and the declared variables' strings of a syntax tree. */
function stringsOf(tree: unknown): Strings
{
    const found: Strings = { strings: [], arrays: new Map(), declared: new Map() };
    walk(tree, (node) =>
    {
        const value = stringOf(node);
        if (value !== undefined)
        {
            found.strings.push({ value, start: node.start });
        }
        const elements = node["elements"] as (Node | null)[] | undefined;
        if (node.type === "ArrayExpression" && elements !== undefined && elements.length > 1 && elements.every((element) => element !== null && typeof stringOf(element) === "string"))
        {
            found.arrays.set(node.start, elements.map((element) => stringOf(element as Node) as string));
        }
        const id = node["id"] as Node | undefined;
        if (node.type === "VariableDeclarator" && id?.type === "Identifier" && node["init"] !== null)
        {
            const key = String(id["name"]);
            found.declared.set(key, [...(found.declared.get(key) ?? []), stringsOf(node["init"])]);
        }
    });
    return found;
}

/** True when an array of strings, joined by the character the minifier chose, is the string. */
function joins(elements: string[], value: string): boolean
{
    return elements.length > 0 && elements.join(value.charAt(elements[0]?.length ?? 0)) === value;
}

/** The offset where each line of a text starts. */
function lineStarts(text: string): number[]
{
    const starts = [0];
    for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1))
    {
        starts.push(index + 1);
    }
    return starts;
}

/** The zero-based line and column of an offset, given the offsets where lines start. */
function position(starts: number[], at: number): { line: number; column: number }
{
    let low = 0;
    let high = starts.length - 1;
    while (low < high)
    {
        const middle = Math.ceil((low + high) / 2);
        if ((starts[middle] ?? 0) <= at)
        {
            low = middle;
        }
        else
        {
            high = middle - 1;
        }
    }
    return { line: low, column: at - (starts[low] ?? 0) };
}

/** The names a module exports, with `*` and the source for a re-export of everything. */
function exportNames(program: Node): string[]
{
    const names: string[] = [];
    for (const statement of program["body"] as Node[])
    {
        if (statement.type === "ExportDefaultDeclaration")
        {
            names.push("default");
        }
        else if (statement.type === "ExportAllDeclaration")
        {
            const exported = statement["exported"] as Node | null;
            names.push(exported === null ? `* from ${String((statement["source"] as Node)["value"])}` : String(exported["name"] ?? exported["value"]));
        }
        else if (statement.type === "ExportNamedDeclaration")
        {
            const declaration = statement["declaration"] as Node | null;
            if (declaration !== null)
            {
                const declared = declaration.type === "VariableDeclaration"
                    ? (declaration["declarations"] as Node[]).map((item) => (item["id"] as Node)["name"])
                    : [(declaration["id"] as Node)["name"]];
                names.push(...declared.map(String));
            }
            for (const specifier of statement["specifiers"] as Node[])
            {
                const exported = specifier["exported"] as Node;
                names.push(String(exported["name"] ?? exported["value"]));
            }
        }
    }
    return names.toSorted();
}

const productionScript = fileURLToPath(new URL("../production.ts", import.meta.url));

/** A built package with two modules in a folder of its own, and a production build from before. */
function fixture(complete: boolean): string
{
    const folder = mkdtempSync(join(tmpdir(), "zerolith-production-"));
    mkdirSync(join(folder, "dist", "production", "old"), { recursive: true });
    mkdirSync(join(folder, "src"));
    writeFileSync(join(folder, "package.json"), "{}");
    for (const name of ["a", "b"])
    {
        writeFileSync(join(folder, "src", `${name}.ts`), `export const ${name} = 1;\n`);
        writeFileSync(join(folder, "dist", `${name}.js`), `export const ${name} = 1;\n//# sourceMappingURL=${name}.js.map\n`);
        if (complete || name === "a")
        {
            writeFileSync(join(folder, "dist", `${name}.js.map`), JSON.stringify({ version: 3, file: `${name}.js`, sources: [`../src/${name}.ts`], names: [], mappings: "AAAA" }));
        }
    }
    writeFileSync(join(folder, "dist", "production", "a.js"), "the previous build");
    writeFileSync(join(folder, "dist", "production", "old", "gone.js"), "the previous build");
    return folder;
}

/** Adds `a/inner.js` and `a/deep/leaf.js` to the fixture, with `a.js` importing `inner`, `inner` importing `leaf` and `../b.js`, and the sources and maps of each. */
function withFolder(folder: string): void
{
    mkdirSync(join(folder, "dist", "a", "deep"), { recursive: true });
    mkdirSync(join(folder, "src", "a", "deep"), { recursive: true });
    const modules: [string, string, string][] = [
        ["a.js", "a.ts", "import { inner } from \"./a/inner.js\";\nexport const a = inner + 1;\nexport { leaf } from \"./a/deep/leaf.js\";\n"],
        ["a/inner.js", "a/inner.ts", "import { leaf } from \"./deep/leaf.js\";\nimport { b } from \"../b.js\";\nexport const inner = leaf + b;\n"],
        ["a/deep/leaf.js", "a/deep/leaf.ts", "export const leaf = \"a leaf of its own\";\n"]
    ];
    for (const [path, source, code] of modules)
    {
        const up = "../".repeat(path.split("/").length);
        writeFileSync(join(folder, "src", source), code);
        writeFileSync(join(folder, "dist", path), `${code}//# sourceMappingURL=${basename(path)}.map\n`);
        writeFileSync(join(folder, "dist", `${path}.map`), JSON.stringify({ version: 3, file: basename(path), sources: [`${up}src/${source}`], names: [], mappings: "AAAA;AACA;AACA" }));
    }
}

/** Runs the production build script in a package folder and returns its exit code. */
function runProduction(folder: string): number
{
    return spawnSync(process.execPath, [productionScript], { cwd: folder, encoding: "utf8" }).status ?? 1;
}

describe("the production build script", () =>
{
    it("builds every module before it writes one, so a failure leaves the previous build", () =>
    {
        const folder = fixture(false);
        try
        {
            expect(runProduction(folder)).not.toBe(0);
            expect(readFileSync(join(folder, "dist", "production", "a.js"), "utf8")).toBe("the previous build");
            expect(existsSync(join(folder, "dist", "production", "old", "gone.js"))).toBe(true);
        }
        finally
        {
            rmSync(folder, { recursive: true, force: true });
        }
    });

    it("refuses an export of a module it does not build, such as a command's entry, before it writes anything", () =>
    {
        const folder = fixture(true);
        try
        {
            writeFileSync(join(folder, "package.json"), JSON.stringify({ exports: { ".": { node: { default: "./dist/production/cli.js" }, default: "./dist/production/a.js" } } }));
            writeFileSync(join(folder, "dist", "cli.js"), "#!/usr/bin/env node\nexport const cli = 1;\n");
            expect(runProduction(folder)).not.toBe(0);
            expect(readFileSync(join(folder, "dist", "production", "a.js"), "utf8")).toBe("the previous build");
        }
        finally
        {
            rmSync(folder, { recursive: true, force: true });
        }
    });

    it("refuses a module that imports one it does not build, before it writes anything", () =>
    {
        const folder = fixture(true);
        try
        {
            writeFileSync(join(folder, "dist", "cli.js"), "#!/usr/bin/env node\nexport const cli = 1;\n");
            writeFileSync(join(folder, "dist", "b.js"), "export { cli } from \"./cli.js\";\n//# sourceMappingURL=b.js.map\n");
            expect(runProduction(folder)).not.toBe(0);
            expect(readFileSync(join(folder, "dist", "production", "a.js"), "utf8")).toBe("the previous build");
        }
        finally
        {
            rmSync(folder, { recursive: true, force: true });
        }
    });

    it("writes the build in place and removes what the previous build had that this one does not", () =>
    {
        const folder = fixture(true);
        try
        {
            expect(runProduction(folder)).toBe(0);
            expect(readdirSync(join(folder, "dist", "production")).toSorted()).toEqual(["a.js", "a.js.map", "b.js", "b.js.map"]);
            expect(readFileSync(join(folder, "dist", "production", "a.js"), "utf8")).toBe("export const a=1;\n//# sourceMappingURL=a.js.map\n");
        }
        finally
        {
            rmSync(folder, { recursive: true, force: true });
        }
    });

    it("bundles a module with the folder beside it into one module, imports from outside the folder left as they are, mapped to every source", () =>
    {
        const folder = fixture(true);
        try
        {
            withFolder(folder);
            expect(runProduction(folder)).toBe(0);
            expect(readdirSync(join(folder, "dist", "production"), { recursive: true }).map(String).toSorted()).toEqual(["a.js", "a.js.map", "b.js", "b.js.map"]);
            const code = readFileSync(join(folder, "dist", "production", "a.js"), "utf8");
            expect(code).toContain("a leaf of its own");
            expect(code).toMatch(/from"\.\/b\.js"/);
            expect(code).not.toContain("inner.js");
            expect(exportNames(parse("a.js", code).program)).toEqual(["a", "leaf"]);
            const map = JSON.parse(readFileSync(join(folder, "dist", "production", "a.js.map"), "utf8")) as Payload;
            expect(map.sources.toSorted()).toEqual(["../../src/a.ts", "../../src/a/deep/leaf.ts", "../../src/a/inner.ts"]);
            expect(map.sourcesContent?.map((text) => text.length)).toEqual(map.sources.map((source) => readFileSync(resolve(folder, "dist", "production", source), "utf8").length));
        }
        finally
        {
            rmSync(folder, { recursive: true, force: true });
        }
    });

    it("refuses a module that imports into the folder beside another, before it writes anything", () =>
    {
        const folder = fixture(true);
        try
        {
            withFolder(folder);
            writeFileSync(join(folder, "dist", "b.js"), "export { leaf as b } from \"./a/deep/leaf.js\";\n//# sourceMappingURL=b.js.map\n");
            const result = spawnSync(process.execPath, [productionScript], { cwd: folder, encoding: "utf8" });
            expect(result.status).not.toBe(0);
            expect(result.stderr).toContain("b.js imports a/deep/leaf.js, which only a.js and its folder may");
            expect(readFileSync(join(folder, "dist", "production", "a.js"), "utf8")).toBe("the previous build");
        }
        finally
        {
            rmSync(folder, { recursive: true, force: true });
        }
    });
});

describe.each(PUBLISHED)("the production build of %s", (name) =>
{
    const production = join(packages, name, "dist", "production");
    const modules = compiled(name);

    it("holds every module of the readable build except a command's entry, and its source map", () =>
    {
        const files = readdirSync(production, { recursive: true }).map((path) => String(path).replaceAll("\\", "/"));
        expect(files.filter((file) => file.endsWith(".js")).toSorted()).toEqual(modules);
        expect(files.filter((file) => file.endsWith(".js.map")).toSorted()).toEqual(modules.map((file) => `${file}.map`));
        expect(files.filter((file) => file.endsWith(".js") || file.endsWith(".js.map")).length).toBe(modules.length * 2);
    });

    it("keeps no comment but the one that names the source map, and exports what the readable module exports", () =>
    {
        for (const path of modules)
        {
            const file = path.slice(path.lastIndexOf("/") + 1);
            const code = readFileSync(join(production, path), "utf8");
            const { program, comments } = parse(file, code);
            expect(comments.map((comment) => comment.value), path).toEqual([`# sourceMappingURL=${file}.map`]);
            expect(code.endsWith(`\n//# sourceMappingURL=${file}.map\n`), path).toBe(true);
            expect(exportNames(program), path).toEqual(exportNames(parse(file, readable(name, path)).program));
        }
    });

    it("maps each module to its TypeScript source, embedded, and each string back to the string or the constant the source holds it in", () =>
    {
        let exact = 0;
        let inlined = 0;
        for (const path of modules)
        {
            const output = join(production, path);
            const code = readFileSync(output, "utf8");
            const map = JSON.parse(readFileSync(`${output}.map`, "utf8")) as Payload;
            expect(map.version).toBe(3);
            expect(map.file).toBe(path.slice(path.lastIndexOf("/") + 1));
            expect(map.sources.length).toBeGreaterThan(0);
            const sources = map.sources.map((source, index) =>
            {
                const file = resolve(output, "..", source);
                expect(file.startsWith(join(packages, name, "src")), source).toBe(true);
                expect(map.sourcesContent?.[index], source).toBe(readFileSync(file, "utf8"));
                const text = map.sourcesContent?.[index] ?? "";
                const found = stringsOf(parse(file, text).program);
                return { file, text, starts: lineStarts(text), found, at: new Map(found.strings.map((item) => [item.start, item.value])) };
            });
            const lookup = new SourceMap({ ...map, sourceRoot: "", sourcesContent: map.sourcesContent ?? [] });
            const starts = lineStarts(code);
            const { program } = parse(path, code);
            const specifiers = new Set((program["body"] as Node[]).map((statement) => (statement["source"] as Node | null | undefined)?.start));
            for (const { value, start } of stringsOf(program).strings)
            {
                if (value.length < 6 || specifiers.has(start))
                {
                    continue;
                }
                const where = position(starts, start);
                const entry = lookup.findEntry(where.line, where.column);
                expect("originalSource" in entry, `${path}: "${value}" is not mapped`).toBe(true);
                const { originalSource, originalLine, originalColumn } = entry as { originalSource: string; originalLine: number; originalColumn: number };
                const source = sources.find((item) => item.file === resolve(output, "..", originalSource));
                expect(source, originalSource).toBeDefined();
                if (source === undefined)
                {
                    continue;
                }
                const there = (source.starts[originalLine] ?? 0) + originalColumn;
                const original = source.at.get(there);
                const elements = source.found.arrays.get(there);
                if ((original !== undefined && original !== "" && value.startsWith(original)) || (elements !== undefined && joins(elements, value)))
                {
                    exact++;
                    continue;
                }
                const word = /^[A-Za-z_$][\w$]*/.exec(source.text.slice(there))?.[0] ?? "";
                const holds = (source.found.declared.get(word) ?? []).some((constant) => constant.strings.some((item) => item.value === value) || [...constant.arrays.values()].some((items) => joins(items, value)));
                expect(holds, `${path}: "${value}" maps to ${originalLine + 1}:${originalColumn + 1}, "${source.text.slice(there, there + 40)}"`).toBe(true);
                inlined++;
            }
        }
        expect(exact).toBeGreaterThan(inlined);
    });

    it("loads every module through a static import, the graph `zerolith importmap` follows to vendor them", () =>
    {
        for (const path of modules)
        {
            const dynamic: Node[] = [];
            walk(parse(path, readFileSync(join(production, path), "utf8")).program, (node) =>
            {
                if (node.type === "ImportExpression")
                {
                    dynamic.push(node);
                }
            });
            expect(dynamic, path).toEqual([]);
        }
    });

    it("maps each entry's development condition to the readable build and default to the production build", () =>
    {
        for (const [subpath, entry] of Object.entries(manifest(name).exports))
        {
            if (typeof entry === "string" || entry["default"] === undefined)
            {
                continue;
            }
            const keys = Object.keys(entry);
            expect(keys[0], subpath).toBe("types");
            expect(keys.at(-1), subpath).toBe("default");
            const development = entry["development"] ?? "";
            const fallback = entry["default"];
            expect(development, subpath).toMatch(/^\.\/dist\/[\w./-]+\.js$/);
            expect(development, subpath).not.toMatch(/^\.\/dist\/production\//);
            expect(fallback, subpath).toMatch(/^\.\/dist\/production\/[\w./-]+\.js$/);
            expect(existsSync(join(packages, name, development)), development).toBe(true);
            expect(existsSync(join(packages, name, fallback)), fallback).toBe(true);
        }
    });
});
