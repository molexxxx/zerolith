import { describe, expect, it } from "vitest";
import { apiReport, referencePage, symbolsOf } from "../reference.ts";
import { type TsType, paramsText, typeText } from "../types.ts";

const STRING: TsType = { kind: "keyword", repr: "string", value: "string" };
const NUMBER: TsType = { kind: "keyword", repr: "number", value: "number" };
const FILE = "file:///repo/src/index.ts";
const ENTRY = { specifier: "sample", file: "src/index.ts", title: "Sample" };

function text(value: string): TsType
{
    return { kind: "literal", value: { kind: "string", string: value } };
}

function ref(name: string): TsType
{
    return { kind: "typeRef", repr: name, value: { typeName: name } };
}

function template(...parts: TsType[]): TsType
{
    return { kind: "literal", repr: "\u001b[0m\u001b[36mcolored\u001b[0m", value: { kind: "template", tsTypes: parts } };
}

function exported(name: string, kind: string, def: Record<string, unknown>): { name: string; declarations: Array<{ kind: string; declarationKind: string; jsDoc: { doc: string }; location: { filename: string; line: number }; def: Record<string, unknown> }> }
{
    return { name, declarations: [{ kind, declarationKind: "export", jsDoc: { doc: `The ${name}.` }, location: { filename: FILE, line: 1 }, def }] };
}

const doc: Parameters<typeof symbolsOf>[0] = {
    version: 2,
    nodes: {
        [FILE]: {
            symbols: [
                exported("createAnnouncer", "function", {
                    params: [{ kind: "assign", left: { kind: "identifier", name: "doc", optional: false, tsType: ref("Document") }, right: "document" }],
                    returnType: ref("Announcer")
                }),
                exported("Sample", "class", {
                    methods: [
                        {
                            name: "run",
                            kind: "method",
                            functionDef: {
                                params: [{ kind: "identifier", name: "value", optional: false, tsType: ref("T") }],
                                returnType: ref("T"),
                                typeParams: [{ name: "T", constraint: STRING }]
                            }
                        },
                        { name: "make", kind: "method", isStatic: true, functionDef: { params: [], returnType: ref("Sample") } }
                    ]
                }),
                exported("Router", "interface", {
                    typeParams: [{ name: "T" }],
                    properties: [{ name: "~standard", readonly: true, tsType: STRING }],
                    methods: [
                        {
                            name: "href",
                            kind: "method",
                            params: [{ kind: "identifier", name: "name", optional: false, tsType: ref("N") }],
                            returnType: STRING,
                            typeParams: [{ name: "N", constraint: { kind: "intersection", value: [{ kind: "typeOperator", value: { operator: "keyof", tsType: ref("T") } }, STRING] } }]
                        }
                    ],
                    indexSignatures: [{ readonly: true, params: [{ kind: "identifier", name: "property", optional: false, tsType: template(text("prop:"), STRING, text("")) }], tsType: { kind: "keyword", value: "unknown" } }]
                }),
                exported("JSX", "namespace", {
                    elements: [
                        exported("Element", "typeAlias", { tsType: ref("View") }),
                        exported("IntrinsicAttributes", "interface", { properties: [{ name: "ref", optional: true, tsType: { kind: "keyword", value: "unknown" } }] })
                    ]
                })
            ]
        }
    }
};

describe("API reference signatures", () =>
{
    it("prints a parameter with a default value as optional, as a declaration file does", () =>
    {
        expect(paramsText([{ kind: "assign", left: { kind: "identifier", name: "rounds", optional: false, tsType: NUMBER } }])).toBe("rounds?: number");
    });

    it("keeps destructuring patterns without their defaults", () =>
    {
        const object = { kind: "object", props: [{ kind: "assign", key: "a", value: null }, { kind: "assign", key: "b", value: null }], optional: false, tsType: { kind: "typeLiteral", value: { properties: [{ name: "a", tsType: NUMBER }, { name: "b", tsType: NUMBER }] } } };
        const array = { kind: "assign", left: { kind: "array", elements: [{ kind: "identifier", name: "first", optional: false }], optional: false, tsType: { kind: "array", value: NUMBER } } };
        expect(paramsText([object, array])).toBe("{ a, b }: { a: number; b: number }, [first]?: number[]");
    });

    it("prints template literal types from their parts instead of the colored text deno doc writes", () =>
    {
        expect(typeText(template(text(""), { kind: "infer", value: { typeParam: { name: "Head" } } }, text("/"), { kind: "infer", value: { typeParam: { name: "Rest" } } }, text("")))).toBe("`${infer Head}/${infer Rest}`");
        expect(typeText({ kind: "literal", value: { kind: "bigInt", string: "10" } })).toBe("10n");
    });

    it("fails on a kind it cannot print rather than printing a placeholder", () =>
    {
        expect(() => paramsText([{ kind: "decorated" }])).toThrow("unsupported parameter kind decorated");
        expect(() => typeText({ kind: "importType", repr: "import(\"x\").Y" })).toThrow("unsupported type kind importType");
    });

    it("prints members with their type parameters, modifiers, and quoted names", () =>
    {
        const symbols = symbolsOf(doc, "/repo", ENTRY);
        expect(symbols.map((symbol) => [symbol.signature].concat((symbol.members ?? []).map((member) => member.signature)))).toEqual([
            ["function createAnnouncer(doc?: Document): Announcer"],
            ["class Sample", "run<T extends string>(value: T): T", "static make(): Sample"],
            ["interface Router<T>", "readonly \"~standard\": string", "href<N extends keyof T & string>(name: N): string", "readonly [property: `prop:${string}`]: unknown"],
            ["namespace JSX", "type Element = View", "interface IntrinsicAttributes { ref?: unknown }"]
        ]);
    });

    it("writes the report as one TypeScript block with a block per interface, class, and namespace", () =>
    {
        const report = apiReport(ENTRY, symbolsOf(doc, "/repo", ENTRY));
        expect(report).toBe([
            "# sample",
            "",
            "Every export of `sample` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.",
            "",
            "```ts",
            "function createAnnouncer(doc?: Document): Announcer",
            "",
            "class Sample",
            "{",
            "    run<T extends string>(value: T): T",
            "    static make(): Sample",
            "}",
            "",
            "interface Router<T>",
            "{",
            "    readonly \"~standard\": string",
            "    href<N extends keyof T & string>(name: N): string",
            "    readonly [property: `prop:${string}`]: unknown",
            "}",
            "",
            "namespace JSX",
            "{",
            "    type Element = View",
            "    interface IntrinsicAttributes { ref?: unknown }",
            "}",
            "```",
            ""
        ].join("\n"));
        expect(report.includes("\u001b")).toBe(false);
    });

    it("fences a member that holds backticks with a longer run on the reference page", () =>
    {
        expect(referencePage(ENTRY, symbolsOf(doc, "/repo", ENTRY))).toContain("- `` readonly [property: `prop:${string}`]: unknown ``");
    });
});
