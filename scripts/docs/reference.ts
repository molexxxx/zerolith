/**
 * Builds the API reference from `deno doc --json`: one Markdown page per
 * package entry and a JSON manifest of every public symbol. The source is
 * the only input, so the reference cannot describe an API that does not
 * exist.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type Param, type TsType, type TypeParam, paramsText, typeParamsText, typeText } from "./types.ts";

const run = promisify(execFile);

export interface Entry
{
    /** The package specifier users import. */
    specifier: string;
    /** The source entry file, relative to the repository root. */
    file: string;
    /** The page title. */
    title: string;
}

interface JsDoc
{
    doc?: string;
    tags?: Array<{ kind: string; name?: string; doc?: string }>;
}

interface Declaration
{
    kind: string;
    declarationKind: string;
    jsDoc?: JsDoc;
    location: { filename: string; line: number };
    def: Record<string, unknown>;
}

interface Symbol
{
    name: string;
    declarations: Declaration[];
}

interface DocJson
{
    version: number;
    nodes: Record<string, { symbols: Symbol[] }>;
}

interface Member
{
    name: string;
    optional?: boolean;
    readonly?: boolean;
    tsType?: TsType;
    params?: Param[];
    returnType?: TsType;
    jsDoc?: JsDoc;
    kind?: string;
}

/** One symbol in the manifest. */
export interface ManifestSymbol
{
    package: string;
    name: string;
    kind: string;
    signature: string;
    doc: string;
    file: string;
    line: number;
    members?: Array<{ name: string; signature: string; doc: string }>;
}

const ORDER = ["function", "class", "interface", "typeAlias", "variable", "enum", "namespace"];
const HEADINGS: Record<string, string> = {
    function: "Functions",
    class: "Classes",
    interface: "Interfaces",
    typeAlias: "Types",
    variable: "Constants",
    enum: "Enums",
    namespace: "Namespaces"
};

/** Runs deno doc over the entries and returns the parsed document. */
export async function extract(root: string, entries: Entry[]): Promise<DocJson>
{
    const bin = `${root}node_modules/.bin/deno${process.platform === "win32" ? ".cmd" : ""}`;
    const { stdout } = await run(bin, ["doc", "--json", ...entries.map((entry) => entry.file)], { cwd: root, maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" });
    const doc = JSON.parse(stdout) as DocJson;
    if (doc.version !== 2)
    {
        throw new Error(`unexpected deno doc JSON version ${doc.version}`);
    }
    return doc;
}

function docText(jsDoc: JsDoc | undefined): string
{
    return (jsDoc?.doc ?? "").trim();
}

function signatureOf(name: string, declaration: Declaration): string
{
    const def = declaration.def;
    switch (declaration.kind)
    {
        case "function":
        {
            const params = def["params"] as Param[] | undefined;
            const typeParams = def["typeParams"] as TypeParam[] | undefined;
            const returnType = def["returnType"] as TsType | undefined;
            return `${def["isAsync"] === true ? "async " : ""}function ${name}${typeParamsText(typeParams)}(${paramsText(params)}): ${typeText(returnType)}`;
        }
        case "interface":
        {
            const typeParams = def["typeParams"] as TypeParam[] | undefined;
            const extendsList = (def["extends"] as TsType[] | undefined) ?? [];
            return `interface ${name}${typeParamsText(typeParams)}${extendsList.length === 0 ? "" : ` extends ${extendsList.map(typeText).join(", ")}`}`;
        }
        case "typeAlias":
        {
            const typeParams = def["typeParams"] as TypeParam[] | undefined;
            return `type ${name}${typeParamsText(typeParams)} = ${typeText(def["tsType"] as TsType | undefined)}`;
        }
        case "variable":
            return `${String(def["kind"] ?? "const")} ${name}: ${typeText(def["tsType"] as TsType | undefined)}`;
        case "class":
        {
            const typeParams = def["typeParams"] as TypeParam[] | undefined;
            const base = def["extends"] as string | undefined;
            const implementsList = (def["implements"] as TsType[] | undefined) ?? [];
            return `class ${name}${typeParamsText(typeParams)}${base === undefined || base === "" ? "" : ` extends ${base}`}${implementsList.length === 0 ? "" : ` implements ${implementsList.map(typeText).join(", ")}`}`;
        }
        default:
            return `${declaration.kind} ${name}`;
    }
}

function memberSignature(member: Member, methodLike: boolean): string
{
    if (methodLike)
    {
        return `${member.name}${member.optional === true ? "?" : ""}(${paramsText(member.params)}): ${typeText(member.returnType)}`;
    }
    return `${member.readonly === true ? "readonly " : ""}${member.name}${member.optional === true ? "?" : ""}: ${typeText(member.tsType)}`;
}

function membersOf(declaration: Declaration): Array<{ name: string; signature: string; doc: string }>
{
    const def = declaration.def;
    const out: Array<{ name: string; signature: string; doc: string }> = [];
    if (declaration.kind === "interface" || declaration.kind === "class")
    {
        for (const constructor of (def["constructors"] as Member[] | undefined) ?? [])
        {
            out.push({ name: "constructor", signature: `constructor(${paramsText(constructor.params)})`, doc: docText(constructor.jsDoc) });
        }
        for (const property of (def["properties"] as Member[] | undefined) ?? [])
        {
            out.push({ name: property.name, signature: memberSignature(property, false), doc: docText(property.jsDoc) });
        }
        for (const method of (def["methods"] as Member[] | undefined) ?? [])
        {
            out.push({ name: method.name, signature: memberSignature(method, true), doc: docText(method.jsDoc) });
        }
        for (const index of (def["indexSignatures"] as Array<{ readonly?: boolean; params: Param[]; tsType?: TsType }> | undefined) ?? [])
        {
            out.push({ name: "[index]", signature: `${index.readonly === true ? "readonly " : ""}[${paramsText(index.params)}]: ${typeText(index.tsType)}`, doc: "" });
        }
    }
    return out;
}

/** The symbols of one entry, in declaration order, as manifest records. */
export function symbolsOf(doc: DocJson, root: string, entry: Entry): ManifestSymbol[]
{
    const key = Object.keys(doc.nodes).find((url) => url.endsWith("/" + entry.file.replace(/\\/g, "/")));
    if (key === undefined)
    {
        throw new Error(`deno doc returned no module for ${entry.file}`);
    }
    const out: ManifestSymbol[] = [];
    for (const symbol of doc.nodes[key]?.symbols ?? [])
    {
        for (const declaration of symbol.declarations)
        {
            if (declaration.declarationKind !== "export" || declaration.kind === "import" || declaration.kind === "moduleDoc")
            {
                continue;
            }
            const record: ManifestSymbol = {
                package: entry.specifier,
                name: symbol.name,
                kind: declaration.kind,
                signature: signatureOf(symbol.name, declaration),
                doc: docText(declaration.jsDoc),
                file: declaration.location.filename.replace(/^file:\/\/\/?/, "").replace(root.replace(/\\/g, "/").replace(/^\/?/, ""), "").replace(/^\//, ""),
                line: declaration.location.line
            };
            const members = membersOf(declaration);
            if (members.length > 0)
            {
                record.members = members;
            }
            out.push(record);
        }
    }
    return out;
}

/** The Markdown page for one entry. */
export function referencePage(entry: Entry, symbols: ManifestSymbol[]): string
{
    const lines: string[] = [`# ${entry.title}`, "", `Import from \`${entry.specifier}\`. Generated from the source; every signature below is what the published types declare.`, ""];
    const missing = symbols.filter((symbol) => symbol.doc === "");
    if (missing.length > 0)
    {
        throw new Error(`${entry.specifier}: undocumented exports: ${missing.map((symbol) => symbol.name).join(", ")}`);
    }
    for (const kind of ORDER)
    {
        const group = symbols.filter((symbol) => symbol.kind === kind);
        if (group.length === 0)
        {
            continue;
        }
        lines.push(`## ${HEADINGS[kind] ?? kind}`, "");
        for (const symbol of group)
        {
            lines.push(`### ${symbol.name}`, "", "```ts", symbol.signature, "```", "", symbol.doc, "");
            for (const member of symbol.members ?? [])
            {
                lines.push(`- \`${member.signature}\`${member.doc === "" ? "" : `: ${member.doc}`}`);
            }
            if (symbol.members !== undefined)
            {
                lines.push("");
            }
            lines.push(`Source: \`${symbol.file}:${symbol.line}\``, "");
        }
    }
    return lines.join("\n");
}
