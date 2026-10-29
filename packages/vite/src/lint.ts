/**
 * Development warnings over templates, the checks the runtime cannot make:
 * a signal read with `.get()` bound as content or attribute, which freezes
 * the value at creation, and the accessibility defects visible in static
 * markup. Each finding carries a stable code and the offset in the module.
 */
import { type AstNode, walk } from "./ast.js";
import type { ModuleParser } from "./transform.js";

/** The checks `lintModule` runs. */
export type LintCode = "template_frozen_read" | "image_without_alt" | "button_without_name" | "frame_without_title";

/** One finding. */
export interface Finding
{
    readonly code: LintCode;
    readonly message: string;
    /** Offset of the finding in the module. */
    readonly offset: number;
}

interface TaggedTemplate extends AstNode
{
    type: "TaggedTemplateExpression";
    tag: AstNode & { name?: string };
    quasi: { quasis: (AstNode & { value: { raw: string } })[]; expressions: AstNode[] };
}

interface CallExpression extends AstNode
{
    type: "CallExpression";
    callee: AstNode & { property?: AstNode & { name?: string }; computed?: boolean; optional?: boolean };
    arguments: AstNode[];
}

const TAGS = new Set(["html", "__zl_html"]);
const FUNCTIONS = new Set(["ArrowFunctionExpression", "FunctionExpression"]);
const HOLE = "\u0000";

/** A `.get()` call with no arguments outside any function in the expression, which a template binds once and never again. */
function frozenRead(expression: AstNode): AstNode | undefined
{
    let found: AstNode | undefined;
    walk(expression, (node) =>
    {
        if (found !== undefined || FUNCTIONS.has(node.type))
        {
            return false;
        }
        if (node.type === "CallExpression")
        {
            const call = node as CallExpression;
            if (call.arguments.length === 0 && call.callee.type === "MemberExpression" && call.callee.computed !== true && call.callee.property?.name === "get")
            {
                found = node;
                return false;
            }
        }
        return true;
    });
    return found;
}

function attributes(tag: string): string
{
    return tag.replace(/^<[a-zA-Z][^\s/>]*/, "");
}

function hasAttribute(tag: string, name: string): boolean
{
    return new RegExp(`[\\s]${name}(?:[\\s=/>]|$)`, "i").test(attributes(tag));
}

/** Static markup checks over the template text, with expressions replaced by a marker so a bound attribute still counts. */
function markup(template: TaggedTemplate, findings: Finding[]): void
{
    const parts = template.quasi.quasis;
    const text = parts.map((part) => part.value.raw).join(HOLE);
    const offsetOf = (index: number): number =>
    {
        let remaining = index;
        for (const part of parts)
        {
            if (remaining <= part.value.raw.length)
            {
                return part.start + remaining;
            }
            remaining -= part.value.raw.length + HOLE.length;
        }
        return template.start;
    };
    for (const match of text.matchAll(/<(img|button|iframe)\b[^>]*>/gi))
    {
        const tag = match[0];
        const name = (match[1] ?? "").toLowerCase();
        const offset = offsetOf(match.index);
        if (name === "img" && !hasAttribute(tag, "alt"))
        {
            findings.push({ code: "image_without_alt", message: "<img> has no alt attribute; give it alternative text or alt=\"\" when it is decorative.", offset });
        }
        else if (name === "iframe" && !hasAttribute(tag, "title"))
        {
            findings.push({ code: "frame_without_title", message: "<iframe> has no title attribute; name what it embeds.", offset });
        }
        else if (name === "button" && !hasAttribute(tag, "aria-label") && !hasAttribute(tag, "aria-labelledby") && !hasAttribute(tag, "title"))
        {
            const after = text.slice(match.index + tag.length);
            const close = after.search(/<\/button\s*>/i);
            if (close !== -1 && after.slice(0, close).trim() === "")
            {
                findings.push({ code: "button_without_name", message: "<button> has no content and no aria-label; a button needs an accessible name.", offset });
            }
        }
    }
}

/**
 * Checks every `html` template in a module. Returns the findings in source
 * order; a module without templates, or one that does not parse, yields
 * none, since the parser's own errors come first.
 */
export function lintModule(code: string, id: string, parse: ModuleParser): Finding[]
{
    if (!code.includes("html`") && !code.includes("__zl_html`"))
    {
        return [];
    }
    const { program, errors } = parse(id, code);
    if (errors.length > 0)
    {
        return [];
    }
    const findings: Finding[] = [];
    walk(program.body, (node) =>
    {
        if (node.type !== "TaggedTemplateExpression")
        {
            return true;
        }
        const template = node as TaggedTemplate;
        if (template.tag.type !== "Identifier" || !TAGS.has(template.tag.name ?? ""))
        {
            return true;
        }
        for (const expression of template.quasi.expressions)
        {
            const read = frozenRead(expression);
            if (read !== undefined)
            {
                findings.push({ code: "template_frozen_read", message: "A .get() read is bound in a template, so the value is read once when the template is created and never updates. Bind the signal itself, or computed(() => ...) for a derived value.", offset: read.start });
            }
        }
        markup(template, findings);
        return true;
    });
    return findings.toSorted((a, b) => a.offset - b.offset);
}

/** The line and column, 1-based, of an offset in a module. */
export function position(code: string, offset: number): { line: number; column: number }
{
    const before = code.slice(0, offset);
    const line = before.split("\n").length;
    const column = offset - before.lastIndexOf("\n");
    return { line, column };
}
