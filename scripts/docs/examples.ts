/**
 * Executed examples for the guides. An `@include path#region` line in a
 * guide becomes that region of a test file, shown as application code with
 * the imports it uses, so every example in the docs runs as a test in CI
 * and still reads like the code an application contains.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { identifiers } from "./highlight.ts";

/** One import of a module: how the import list spells it, the name the code uses, whether it is a type, and whether it is the default export. */
interface Binding
{
    spec: string;
    local: string;
    type: boolean;
    from: string;
    fallback: boolean;
}

/** The named and default imports of a module, in source order. */
function bindingsOf(source: string): Binding[]
{
    const found: { at: number; binding: Binding }[] = [];
    for (const match of source.matchAll(/^import\s+(type\s+)?\{([^}]*)\}\s*from\s*"([^"]+)";?$/gm))
    {
        for (const part of (match[2] ?? "").split(","))
        {
            const spec = part.trim().replace(/\s+/g, " ");
            if (spec !== "")
            {
                const name = spec.replace(/^type /, "");
                found.push({ at: match.index, binding: { spec: name, local: name.split(" as ").at(-1) ?? name, type: match[1] !== undefined || spec.startsWith("type "), from: match[3] ?? "", fallback: false } });
            }
        }
    }
    for (const match of source.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from\s*"([^"]+)";?$/gm))
    {
        const name = match[1] ?? "";
        found.push({ at: match.index, binding: { spec: name, local: name, type: false, from: match[2] ?? "", fallback: true } });
    }
    return found.toSorted((a, b) => a.at - b.at).map((item) => item.binding);
}

/** A relative module as the application would import it: the path below a test's `fixtures` folder, or the file as a sibling. */
export function applicationPath(from: string): string
{
    if (!from.startsWith("."))
    {
        return from;
    }
    const fixtures = from.lastIndexOf("fixtures/");
    return `./${fixtures === -1 ? (from.split("/").at(-1) ?? "") : from.slice(fixtures + "fixtures/".length)}`;
}

/**
 * The import declarations an example needs: the source file's own imports of
 * the names the example uses, so they are as correct as the test that runs
 * it. A relative module is shown where the application would keep it, and
 * the test runner's imports only for an example that is itself a test.
 */
export function importsFor(code: string, source: string, test: boolean): string[]
{
    const used = identifiers(code);
    const modules = new Map<string, Binding[]>();
    for (const binding of bindingsOf(source))
    {
        if (used.has(binding.local) && (test || binding.from !== "vitest"))
        {
            const from = applicationPath(binding.from);
            modules.set(from, [...(modules.get(from) ?? []), binding]);
        }
    }
    return [...modules].map(([from, all]) =>
    {
        const fallback = all.find((binding) => binding.fallback)?.local;
        const bindings = all.filter((binding) => !binding.fallback);
        if (bindings.length === 0)
        {
            return `import ${fallback} from "${from}";`;
        }
        const types = bindings.every((binding) => binding.type);
        const names = bindings.map((binding) => (binding.type && !types ? `type ${binding.spec}` : binding.spec));
        const lead = `import ${types ? "type " : ""}${fallback === undefined ? "" : `${fallback}, `}`;
        const line = `${lead}{ ${names.join(", ")} } from "${from}";`;
        return line.length <= 80 ? line : `${lead}{\n${fill(names)}\n} from "${from}";`;
    });
}

/** Names spread over indented lines of at most 80 characters, for an import too long for one. */
function fill(names: string[]): string
{
    const lines: string[] = [];
    let line = "";
    for (const [index, name] of names.entries())
    {
        const piece = name + (index < names.length - 1 ? "," : "");
        if (line !== "" && 4 + line.length + 1 + piece.length > 80)
        {
            lines.push(line);
            line = piece;
        }
        else
        {
            line = line === "" ? piece : `${line} ${piece}`;
        }
    }
    lines.push(line);
    return lines.map((text) => `    ${text}`).join("\n");
}

/** Every part of a region, in order: a region may be opened and closed several times so checks can run between its parts. */
export function regionParts(source: string, region: string): string[]
{
    const parts: string[] = [];
    let current: string[] | undefined;
    for (const line of source.split("\n"))
    {
        const marker = line.trim();
        if (marker === `// #region ${region}`)
        {
            current = [];
        }
        else if (marker === `// #endregion ${region}` && current !== undefined)
        {
            parts.push(current.join("\n"));
            current = undefined;
        }
        else if (current !== undefined && !/^\/\/ #(?:end)?region\b/.test(marker))
        {
            current.push(line);
        }
    }
    return parts;
}

const languages = new Set(["ts", "tsx", "js", "jsx", "html", "css", "json", "sh"]);

/**
 * The code an include stands for, from the included file's text, with its
 * language. The code is application code: a region that shows a test check
 * is refused, the imports the code uses are added, and the code is dedented.
 * Options after the region change that: `test` shows a test as a test,
 * `excerpt` shows the text verbatim with no imports added, `wide` lets lines
 * run past 80 characters, for generated output and data that cannot wrap,
 * and a language name sets the language. Without a region, the whole file
 * is shown verbatim.
 */
export function exampleCode(source: string, path: string, region: string | undefined, options: string[], file: string): { language: string; code: string }
{
    const unknown = options.filter((option) => !["test", "excerpt", "wide"].includes(option) && !languages.has(option));
    if (unknown.length > 0)
    {
        throw new Error(`${file}: unknown include option ${unknown.join(", ")} for ${path}`);
    }
    const extension = /\.(tsx|ts|jsx|js|json|html|css)$/.exec(path)?.[1] ?? "ts";
    const language = options.find((option) => languages.has(option)) ?? extension;
    if (region === undefined)
    {
        return { language, code: source.trim() };
    }
    const parts = regionParts(source, region);
    if (parts.length === 0)
    {
        throw new Error(`${file}: region ${region} not found in ${path}`);
    }
    const test = options.includes("test");
    const lines = parts.join("\n").split("\n");
    const indent = Math.min(...lines.filter((text) => text.trim() !== "").map((text) => /^\s*/.exec(text)?.[0].length ?? 0));
    const code = lines.map((text) => text.slice(indent)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!test && /\bexpect\(|\bvi\./.test(code))
    {
        throw new Error(`${file}: ${path}#${region} shows a test check; keep checks outside the region, or include it with \`test\``);
    }
    const imports = options.includes("excerpt") ? [] : importsFor(code, source, test);
    return { language, code: (imports.length > 0 ? imports.join("\n") + "\n\n" : "") + code };
}

/** The fenced block an include stands for; see `exampleCode` for what the options do. */
export function renderExample(source: string, path: string, region: string | undefined, options: string[], file: string): string
{
    const { language, code } = exampleCode(source, path, region, options, file);
    return "```" + language + (options.includes("wide") ? " wide" : "") + "\n" + code + "\n```";
}

/** Replaces every `@include path#region options` line of a guide with the example it names, reading files under `root`. */
export async function includeExamples(markdown: string, file: string, root: string): Promise<string>
{
    const lines = await Promise.all(markdown.split("\n").map(async (line) =>
    {
        const match = /^@include\s+([^\s#]+)(?:#(\S+))?((?:\s+\w+)*)\s*$/.exec(line);
        if (match === null)
        {
            return line;
        }
        const path = match[1] ?? "";
        const options = (match[3] ?? "").trim().split(/\s+/).filter(Boolean);
        return renderExample(await readFile(join(root, path), "utf8"), path, match[2], options, file);
    }));
    return lines.join("\n");
}
