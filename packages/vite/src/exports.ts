/**
 * What a module binds to a name among its own top-level declarations and
 * imports, and what it exports under a name, so the dev server's template
 * lint reports a capitalized name bound as content only when it is a
 * function or a class, wherever the module that defines it is, as
 * `zerolith lint` does.
 */
import type { AstNode } from "./ast.js";

/** What a module binds to a name. */
type Binding =
    | { kind: "function" }
    | { kind: "value" }
    | { kind: "from"; specifier: string; name: string }
    | { kind: "stars"; specifiers: string[] };

/** How many imports and re-exports the lint follows to find the module that defines a component, as `zerolith lint` does. */
const FOLLOWED = 8;

const FUNCTIONS = new Set(["ArrowFunctionExpression", "FunctionExpression", "ClassExpression"]);

interface Named extends AstNode
{
    id?: { name?: string } | null;
    init?: AstNode | null;
    declarations?: Named[];
    declaration?: Named | null;
    specifiers?: Named[];
    source?: { value?: unknown } | null;
    local?: { name?: string; value?: unknown };
    imported?: { name?: string; value?: unknown };
    exported?: { name?: string; value?: unknown } | null;
    importKind?: string;
    exportKind?: string;
}

/** The text of an identifier or a string module export name. */
function nameOf(node: { name?: string; value?: unknown } | null | undefined): string | undefined
{
    return node?.name ?? (typeof node?.value === "string" ? node.value : undefined);
}

/** The source of an import or a re-export. */
function sourceOf(node: Named): string
{
    return typeof node.source?.value === "string" ? node.source.value : "";
}

/** What one declaration binds to `name`, when it declares it. */
function declaration(node: Named | null | undefined, name: string): Binding | undefined
{
    if (node === null || node === undefined)
    {
        return undefined;
    }
    if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id?.name === name)
    {
        return { kind: "function" };
    }
    if (node.type === "VariableDeclaration")
    {
        const found = node.declarations?.find((declarator) => declarator.id?.name === name);
        if (found !== undefined)
        {
            return found.init !== null && found.init !== undefined && FUNCTIONS.has(found.init.type) ? { kind: "function" } : { kind: "value" };
        }
    }
    if (node.type === "TSEnumDeclaration" && node.id?.name === name)
    {
        return { kind: "value" };
    }
    return undefined;
}

/** What a parsed module binds to `name` at its top level, by a declaration, exported or not, or an import. */
function declared(body: Named[], name: string): Binding | undefined
{
    for (const statement of body)
    {
        if (statement.type === "ImportDeclaration")
        {
            if (statement.importKind === "type")
            {
                continue;
            }
            for (const specifier of statement.specifiers ?? [])
            {
                if (specifier.local?.name !== name)
                {
                    continue;
                }
                if (specifier.type === "ImportSpecifier" && specifier.importKind !== "type")
                {
                    return { kind: "from", specifier: sourceOf(statement), name: nameOf(specifier.imported) ?? name };
                }
                if (specifier.type === "ImportDefaultSpecifier")
                {
                    return { kind: "from", specifier: sourceOf(statement), name: "default" };
                }
                if (specifier.type === "ImportNamespaceSpecifier")
                {
                    return { kind: "value" };
                }
            }
            continue;
        }
        const found = declaration(statement.type === "ExportNamedDeclaration" ? statement.declaration : statement, name);
        if (found !== undefined)
        {
            return found;
        }
    }
    return undefined;
}

/** What a parsed module exports under `name`, `default` for its default export. */
function exported(body: Named[], name: string): Binding | undefined
{
    const stars: string[] = [];
    for (const statement of body)
    {
        if (statement.type === "ExportNamedDeclaration" && statement.exportKind !== "type")
        {
            const found = declaration(statement.declaration, name);
            if (found !== undefined)
            {
                return found;
            }
            const specifier = statement.specifiers?.find((candidate) => nameOf(candidate.exported) === name && candidate.exportKind !== "type");
            if (specifier !== undefined)
            {
                const local = nameOf(specifier.local) ?? name;
                return statement.source === null || statement.source === undefined ? declared(body, local) : { kind: "from", specifier: sourceOf(statement), name: local };
            }
        }
        else if (statement.type === "ExportDefaultDeclaration" && name === "default")
        {
            const value = statement.declaration;
            if (value === null || value === undefined)
            {
                return { kind: "value" };
            }
            if (value.type === "FunctionDeclaration" || value.type === "ClassDeclaration" || FUNCTIONS.has(value.type))
            {
                return { kind: "function" };
            }
            return value.type === "Identifier" ? declared(body, (value as Named & { name?: string }).name ?? "") : { kind: "value" };
        }
        else if (statement.type === "ExportAllDeclaration" && statement.exportKind !== "type")
        {
            const namespace = nameOf(statement.exported);
            if (namespace === name)
            {
                return { kind: "value" };
            }
            if (namespace === undefined)
            {
                stars.push(sourceOf(statement));
            }
        }
    }
    return stars.length === 0 ? undefined : { kind: "stars", specifiers: stars };
}

/** The parser language for a module file, by its extension. */
function languageOf(id: string): "js" | "jsx" | "ts" | "tsx"
{
    const path = id.replace(/[?#].*$/, "");
    if (path.endsWith(".tsx"))
    {
        return "tsx";
    }
    if (path.endsWith(".ts") || path.endsWith(".mts") || path.endsWith(".cts"))
    {
        return "ts";
    }
    return path.endsWith(".jsx") ? "jsx" : "js";
}

/** What the lint needs from its host: the module a specifier names from an importer, a project file and not a package's, and a module's source. */
export interface ModuleReader
{
    /** The id of the project module `specifier` names from `importer`, or undefined for a package, a virtual module, or one that does not resolve. */
    resolve(specifier: string, importer: string): Promise<string | undefined>;
    /** The source of the module with that id, or undefined when it cannot be read. */
    read(id: string): Promise<string | undefined>;
    /** Parses a module's source in the language its file name gives. */
    parse(id: string, code: string, language: "js" | "jsx" | "ts" | "tsx"): AstNode[] | undefined;
}

/** Whether the module `id` exports `name` as a function or a class, following imports and re-exports within the project; undefined when the chain leaves the project, a module cannot be read, or it runs past `FOLLOWED` steps. */
async function exportsFunction(reader: ModuleReader, id: string, name: string, depth: number): Promise<boolean | undefined>
{
    if (depth > FOLLOWED)
    {
        return undefined;
    }
    const source = await reader.read(id);
    const body = source === undefined ? undefined : reader.parse(id, source, languageOf(id));
    const binding = body === undefined ? undefined : exported(body as Named[], name);
    if (binding === undefined)
    {
        return undefined;
    }
    if (binding.kind === "function" || binding.kind === "value")
    {
        return binding.kind === "function";
    }
    if (binding.kind === "from")
    {
        const next = await reader.resolve(binding.specifier, id);
        return next === undefined ? undefined : exportsFunction(reader, next, binding.name, depth + 1);
    }
    const found = await Promise.all(binding.specifiers.map(async (specifier) =>
    {
        const next = await reader.resolve(specifier, id);
        return next === undefined ? undefined : exportsFunction(reader, next, name, depth + 1);
    }));
    return found.find((each) => each !== undefined);
}

/**
 * Whether the capitalized name a `template_component_uncalled` finding
 * points at is a function: one the module defines, or one the project
 * module it imports the name from exports as a function or a class. An
 * imported constant, a view held in a `const`, or a name from a package is
 * not reported, as `zerolith lint` does not report them.
 */
export async function namesAFunction(reader: ModuleReader, id: string, code: string, body: AstNode[], offset: number): Promise<boolean>
{
    const name = /^[\p{L}\p{N}_$]+/u.exec(code.slice(offset))?.[0] ?? "";
    const binding = declared(body as Named[], name);
    if (binding?.kind !== "from")
    {
        return true;
    }
    const module = await reader.resolve(binding.specifier, id);
    return module !== undefined && (await exportsFunction(reader, module, binding.name, 0)) === true;
}
