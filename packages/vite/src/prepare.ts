/**
 * The template prepare pass of ADR 0005: every `html` literal in a module
 * is scanned at build time, and the lowered module registers the markup and
 * the part table next to the literal, so the browser binds the template
 * without scanning it and the scanner leaves the bundle. Pure string work
 * over the parser's tree; the lowered module keeps its line count.
 */
import { type AstNode, type Edit, type IdentityMap, applyEdits, identityMap, walk } from "./ast.js";
import type { ModuleParser } from "./transform.js";

/** The result of preparing one module. */
export interface PrepareOutput
{
    code: string;
    map: IdentityMap;
}

/** One scanned part, as the core's `scan` reports it. */
export interface ScannedPart
{
    readonly kind: number;
    readonly name: string;
    readonly strings: readonly string[];
}

/** Scans a template's cooked strings: the core's `scan`, passed in so the pass has no import of its own. */
export type TemplateScanner = (strings: readonly string[]) => { markup: string; parts: readonly ScannedPart[] };

/** The binding the lowered code imports `prepared` under, chosen not to clash with user code. */
export const PREPARED_BINDING: string = "__zl_prepared";
/** The prefix of the hoisted template bindings, numbered per module. */
export const TEMPLATE_BINDING: string = "__zl_t";

const SPECIFIER = "zerolith";
const HEAD = `import { prepared as ${PREPARED_BINDING} } from "${SPECIFIER}";`;

/** TypeScript nodes that wrap an expression and so are walked; every other TS node is a type and is skipped. */
const TS_EXPRESSIONS: ReadonlySet<string> = new Set(["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSInstantiationExpression", "TSTypeAssertion"]);

interface Identifier extends AstNode
{
    type: "Identifier";
    name: string;
}

interface ImportDeclaration extends AstNode
{
    type: "ImportDeclaration";
    source: { value: string };
    specifiers: readonly (AstNode & { local: Identifier; imported?: Identifier | { value: string } })[];
}

interface MemberExpression extends AstNode
{
    type: "MemberExpression";
    object: AstNode;
    property: AstNode;
    computed: boolean;
}

interface TaggedTemplate extends AstNode
{
    type: "TaggedTemplateExpression";
    tag: AstNode;
    quasi: { quasis: readonly { value: { cooked: string | null } }[]; expressions: readonly AstNode[] };
}

/** Thrown for a module the pass refuses, with the offset in the module. */
export class PrepareError extends Error
{
    readonly offset: number;

    constructor(message: string, offset: number)
    {
        super(`zerolith: ${message}`);
        this.name = "PrepareError";
        this.offset = offset;
    }
}

function isIdentifier(node: AstNode, name?: string): node is Identifier
{
    return node.type === "Identifier" && (name === undefined || (node as Identifier).name === name);
}

function importedName(specifier: ImportDeclaration["specifiers"][number]): string | undefined
{
    const imported = specifier.imported;
    if (imported === undefined)
    {
        return undefined;
    }
    return "name" in imported ? imported.name : imported.value;
}

function newlines(text: string): string
{
    let count = 0;
    for (const c of text)
    {
        if (c === "\n")
        {
            count++;
        }
    }
    return "\n".repeat(count);
}

/**
 * Prepares one module. Returns null when the module imports no `html` from
 * zerolith, and throws a `PrepareError` when `html` is declared or used
 * other than as a template tag, since the bundle will carry no scanner.
 */
export function prepareModule(code: string, id: string, parse: ModuleParser, scan: TemplateScanner): PrepareOutput | null
{
    const parsed = parse(id, code);
    if (parsed.errors.length > 0)
    {
        return null;
    }
    const locals = new Set<string>();
    const namespaces = new Set<string>();
    const allowed = new Set<number>();
    let firstStatement: number | undefined;
    for (const statement of parsed.program.body)
    {
        if (statement.type !== "ImportDeclaration")
        {
            firstStatement ??= statement.start;
            continue;
        }
        const declaration = statement as ImportDeclaration;
        if (declaration.source.value !== SPECIFIER)
        {
            continue;
        }
        for (const specifier of declaration.specifiers)
        {
            allowed.add(specifier.local.start);
            if (specifier.type === "ImportNamespaceSpecifier")
            {
                namespaces.add(specifier.local.name);
            }
            else if (importedName(specifier) === "html")
            {
                locals.add(specifier.local.name);
            }
        }
    }
    if (locals.size === 0 && namespaces.size === 0)
    {
        return null;
    }
    const templates: TaggedTemplate[] = [];
    const tagOf = (node: AstNode): boolean =>
    {
        if (isIdentifier(node))
        {
            return locals.has(node.name);
        }
        if (node.type !== "MemberExpression")
        {
            return false;
        }
        const member = node as MemberExpression;
        return !member.computed && isIdentifier(member.object) && namespaces.has(member.object.name) && isIdentifier(member.property, "html");
    };
    walk(parsed.program, (node) =>
    {
        if (node.type.startsWith("TS") && !TS_EXPRESSIONS.has(node.type))
        {
            return false;
        }
        switch (node.type)
        {
            case "TaggedTemplateExpression":
            {
                const tagged = node as TaggedTemplate;
                if (tagOf(tagged.tag))
                {
                    allowed.add(tagged.tag.start);
                    templates.push(tagged);
                }
                break;
            }
            case "MemberExpression":
            {
                const member = node as MemberExpression;
                if (!member.computed)
                {
                    allowed.add(member.property.start);
                }
                if (tagOf(member) && !allowed.has(member.start))
                {
                    throw new PrepareError("html from zerolith is used here other than as a template tag, which the prepare pass cannot follow; pass prepare: false to the plugin to keep the scanner", member.start);
                }
                break;
            }
            case "Property":
            case "MethodDefinition":
            case "PropertyDefinition":
            {
                const keyed = node as AstNode & { key: AstNode; computed: boolean; shorthand?: boolean };
                if (!keyed.computed && keyed.shorthand !== true)
                {
                    allowed.add(keyed.key.start);
                }
                break;
            }
            case "Identifier":
                if (locals.has((node as Identifier).name) && !allowed.has(node.start))
                {
                    throw new PrepareError("html from zerolith is declared or used here other than as a template tag, which the prepare pass cannot follow; pass prepare: false to the plugin to keep the scanner", node.start);
                }
                break;
            default:
                break;
        }
        return true;
    });
    if (templates.length === 0)
    {
        return null;
    }
    const edits: Edit[] = [{ start: 0, end: 0, text: HEAD }];
    let hoisted = "";
    for (const [index, template] of templates.entries())
    {
        const strings: string[] = [];
        for (const quasi of template.quasi.quasis)
        {
            if (quasi.value.cooked === null)
            {
                throw new PrepareError("this template has an escape sequence with no value, which the prepare pass cannot lower", template.start);
            }
            strings.push(quasi.value.cooked);
        }
        let markup: string;
        let parts: readonly ScannedPart[];
        try
        {
            ({ markup, parts } = scan(strings));
        }
        catch (error)
        {
            throw new PrepareError(error instanceof Error ? error.message : String(error), template.start);
        }
        const name = `${TEMPLATE_BINDING}${index}`;
        const table = parts.map((part) => [part.kind, part.name, part.strings]);
        hoisted += `const ${name} = ${PREPARED_BINDING}(${JSON.stringify(strings)}, ${JSON.stringify(markup)}, ${JSON.stringify(table)});`;
        const tag = code.slice(template.tag.start, template.tag.end);
        const { expressions } = template.quasi;
        const first = expressions[0];
        if (first === undefined)
        {
            edits.push({ start: template.start, end: template.end, text: `${tag}(${name}${newlines(code.slice(template.start, template.end))})` });
            continue;
        }
        edits.push({ start: template.start, end: first.start, text: `${tag}(${name},${newlines(code.slice(template.start, first.start))} ` });
        for (let i = 1; i < expressions.length; i++)
        {
            const previous = expressions[i - 1] as AstNode;
            const next = expressions[i] as AstNode;
            edits.push({ start: previous.end, end: next.start, text: `,${newlines(code.slice(previous.end, next.start))} ` });
        }
        const last = expressions[expressions.length - 1] as AstNode;
        edits.push({ start: last.end, end: template.end, text: `${newlines(code.slice(last.end, template.end))})` });
    }
    edits.push({ start: firstStatement ?? code.length, end: firstStatement ?? code.length, text: hoisted });
    const output = applyEdits(code, edits);
    return { code: output, map: identityMap(id, code, output) };
}
