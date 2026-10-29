/**
 * The JSX lowering of RFC 0001: each JSX expression in a `.jsx` or `.tsx`
 * file becomes the `html` call it stands for, with components called as
 * functions. Pure string work over the parser's tree, so the plugin and
 * the command line can share it. Lowered code keeps its line count: a
 * replacement that is shorter in lines than the JSX it replaces is padded
 * inside the parentheses that wrap it.
 */
import { type AstNode, type Edit, type IdentityMap, applyEdits, identityMap, walk } from "./ast.js";
import type { ModuleParser } from "./transform.js";

/** The result of lowering one module. */
export interface JsxOutput
{
    code: string;
    map: IdentityMap;
}

/** The binding the lowered code imports `html` under, chosen not to clash with user code. */
export const HTML_BINDING: string = "__zl_html";

interface JsxIdentifier extends AstNode
{
    type: "JSXIdentifier";
    name: string;
}

interface JsxNamespacedName extends AstNode
{
    type: "JSXNamespacedName";
    namespace: JsxIdentifier;
    name: JsxIdentifier;
}

interface JsxMemberExpression extends AstNode
{
    type: "JSXMemberExpression";
    object: JsxIdentifier | JsxMemberExpression;
    property: JsxIdentifier;
}

type JsxElementName = JsxIdentifier | JsxNamespacedName | JsxMemberExpression;

interface JsxAttribute extends AstNode
{
    type: "JSXAttribute";
    name: JsxIdentifier | JsxNamespacedName;
    value: AstNode | null;
}

interface JsxSpreadAttribute extends AstNode
{
    type: "JSXSpreadAttribute";
    argument: AstNode;
}

interface JsxElement extends AstNode
{
    type: "JSXElement";
    openingElement: AstNode & { name: JsxElementName; attributes: (JsxAttribute | JsxSpreadAttribute)[]; selfClosing: boolean };
    children: AstNode[];
}

interface JsxFragment extends AstNode
{
    type: "JSXFragment";
    children: AstNode[];
}

interface JsxText extends AstNode
{
    type: "JSXText";
    value: string;
}

interface JsxExpressionContainer extends AstNode
{
    type: "JSXExpressionContainer";
    expression: AstNode;
}

interface StringLiteral extends AstNode
{
    type: "Literal" | "StringLiteral";
    value: string;
}

/** Thrown for JSX the lowering refuses, with the offset in the module. */
export class JsxError extends Error
{
    readonly offset: number;

    constructor(message: string, offset: number)
    {
        super(`zerolith: ${message}`);
        this.name = "JsxError";
        this.offset = offset;
    }
}

/** JSX text semantics: lines trimmed, whitespace-only lines dropped, the rest joined with one space. */
function cleanText(raw: string): string
{
    const lines = raw.split(/\r\n|\n|\r/);
    let lastNonEmpty = 0;
    for (const [index, line] of lines.entries())
    {
        if (/[^ \t]/.test(line))
        {
            lastNonEmpty = index;
        }
    }
    let text = "";
    for (const [index, line] of lines.entries())
    {
        let trimmed = line.replace(/\t/g, " ");
        if (index !== 0)
        {
            trimmed = trimmed.replace(/^ +/, "");
        }
        if (index !== lines.length - 1)
        {
            trimmed = trimmed.replace(/ +$/, "");
        }
        if (trimmed !== "")
        {
            text += index === lastNonEmpty ? trimmed : `${trimmed} `;
        }
    }
    return text;
}

/** Escapes text for the inside of a template literal. */
function literal(text: string): string
{
    return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function elementName(name: JsxElementName): string
{
    switch (name.type)
    {
        case "JSXIdentifier":
            return name.name;
        case "JSXNamespacedName":
            return `${name.namespace.name}:${name.name.name}`;
        default:
            return `${elementName(name.object)}.${name.property.name}`;
    }
}

function isComponent(name: JsxElementName): boolean
{
    if (name.type === "JSXMemberExpression")
    {
        return true;
    }
    if (name.type === "JSXNamespacedName")
    {
        return false;
    }
    const first = name.name.charAt(0);
    return first !== first.toLowerCase() && !name.name.includes("-");
}

/** The template attribute spelling of a JSX attribute name: `prop:value` is `.value`, `on:click` is `@click`, `bool:open` is `?open`. */
function attributeName(name: JsxIdentifier | JsxNamespacedName): string
{
    if (name.type === "JSXIdentifier")
    {
        return name.name;
    }
    const prefix = name.namespace.name;
    const local = name.name.name;
    switch (prefix)
    {
        case "prop":
            return `.${local}`;
        case "on":
            return `@${local}`;
        case "bool":
            return `?${local}`;
        case "attr":
            return local;
        default:
            return `${prefix}:${local}`;
    }
}

class Lowering
{
    private readonly code: string;

    constructor(code: string)
    {
        this.code = code;
    }

    /** The source of an expression with every JSX inside it lowered. */
    expression(node: AstNode): string
    {
        const edits: Edit[] = [];
        this.collect(node, node.start, edits);
        return applyEdits(this.code.slice(node.start, node.end), edits);
    }

    /** Finds the outermost JSX nodes under `root` and records their replacements, relative to `base`. */
    collect(root: AstNode, base: number, edits: Edit[]): void
    {
        walk(root, (node) =>
        {
            if (node === root)
            {
                return node.type !== "JSXElement" && node.type !== "JSXFragment";
            }
            if (node.type === "JSXElement" || node.type === "JSXFragment")
            {
                edits.push({ start: node.start - base, end: node.end - base, text: this.view(node as JsxElement | JsxFragment) });
                return false;
            }
            return true;
        });
        if (root.type === "JSXElement" || root.type === "JSXFragment")
        {
            edits.push({ start: root.start - base, end: root.end - base, text: this.view(root as JsxElement | JsxFragment) });
        }
    }

    /** A whole JSX tree as an `html` call, padded to the lines it replaces. */
    view(node: JsxElement | JsxFragment): string
    {
        const inner = node.type === "JSXFragment" ? this.children(node.children) : this.element(node);
        const call = `${HTML_BINDING}\`${inner}\``;
        const originalLines = this.code.slice(node.start, node.end).split("\n").length;
        const padding = Math.max(0, originalLines - call.split("\n").length);
        return `(${call}${"\n".repeat(padding)})`;
    }

    /** The markup of an element inside a template, or a component call hole. */
    private element(node: JsxElement): string
    {
        const { name, attributes, selfClosing } = node.openingElement;
        if (isComponent(name))
        {
            return `\${${this.component(node)}}`;
        }
        const tag = elementName(name);
        let markup = `<${tag}`;
        for (const attribute of attributes)
        {
            if (attribute.type === "JSXSpreadAttribute")
            {
                throw new JsxError(`spread attributes on <${tag}> cannot become a template; spread onto a component instead`, attribute.start);
            }
            markup += ` ${this.attribute(attribute)}`;
        }
        if (selfClosing)
        {
            return `${markup}>`;
        }
        return `${markup}>${this.children(node.children)}</${tag}>`;
    }

    private attribute(attribute: JsxAttribute): string
    {
        const name = attributeName(attribute.name);
        const value = attribute.value;
        if (value === null)
        {
            return name;
        }
        if (value.type === "Literal" || value.type === "StringLiteral")
        {
            return `${name}=${literal(this.code.slice(value.start, value.end))}`;
        }
        if (value.type === "JSXExpressionContainer")
        {
            return `${name}=\${${this.expression((value as JsxExpressionContainer).expression)}}`;
        }
        return `${name}=\${${this.view(value as JsxElement | JsxFragment)}}`;
    }

    /** Children as template content. */
    private children(children: readonly AstNode[]): string
    {
        let markup = "";
        for (const child of children)
        {
            switch (child.type)
            {
                case "JSXText":
                    markup += literal(cleanText((child as JsxText).value));
                    break;
                case "JSXElement":
                    markup += this.element(child as JsxElement);
                    break;
                case "JSXFragment":
                    markup += this.children((child as JsxFragment).children);
                    break;
                case "JSXExpressionContainer":
                {
                    const { expression } = child as JsxExpressionContainer;
                    if (expression.type !== "JSXEmptyExpression")
                    {
                        markup += `\${${this.expression(expression)}}`;
                    }
                    break;
                }
                default:
                    throw new JsxError("spread children cannot become a template", child.start);
            }
        }
        return markup;
    }

    /** A child as a JavaScript value, for the `children` prop of a component. */
    private childValue(child: AstNode): string | undefined
    {
        switch (child.type)
        {
            case "JSXText":
            {
                const text = cleanText((child as JsxText).value);
                return text === "" ? undefined : JSON.stringify(text);
            }
            case "JSXElement":
            case "JSXFragment":
                return this.view(child as JsxElement | JsxFragment);
            case "JSXExpressionContainer":
            {
                const { expression } = child as JsxExpressionContainer;
                return expression.type === "JSXEmptyExpression" ? undefined : this.expression(expression);
            }
            default:
                throw new JsxError("spread children cannot become a template", child.start);
        }
    }

    /** `Name({ props, children })` for a component tag. */
    private component(node: JsxElement): string
    {
        const { name, attributes } = node.openingElement;
        const entries: string[] = [];
        for (const attribute of attributes)
        {
            if (attribute.type === "JSXSpreadAttribute")
            {
                entries.push(`...${this.expression(attribute.argument)}`);
                continue;
            }
            const key = attribute.name.type === "JSXIdentifier" ? attribute.name.name : `${attribute.name.namespace.name}:${attribute.name.name.name}`;
            const quoted = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
            const value = attribute.value;
            if (value === null)
            {
                entries.push(`${quoted}: true`);
            }
            else if (value.type === "Literal" || value.type === "StringLiteral")
            {
                entries.push(`${quoted}: ${JSON.stringify((value as StringLiteral).value)}`);
            }
            else if (value.type === "JSXExpressionContainer")
            {
                entries.push(`${quoted}: ${this.expression((value as JsxExpressionContainer).expression)}`);
            }
            else
            {
                entries.push(`${quoted}: ${this.view(value as JsxElement | JsxFragment)}`);
            }
        }
        const values = node.children.map((child) => this.childValue(child)).filter((value): value is string => value !== undefined);
        if (values.length === 1)
        {
            entries.push(`children: ${values[0]}`);
        }
        else if (values.length > 1)
        {
            entries.push(`children: [${values.join(", ")}]`);
        }
        return `${elementName(name)}(${entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`})`;
    }
}

/**
 * Lowers every JSX expression in a module to `html` calls and imports
 * `html` under a private name. Returns null when the module has no JSX.
 * The parser must be set up for JSX, `tsx` for a `.tsx` file.
 */
export function lowerJsx(code: string, id: string, parse: ModuleParser): JsxOutput | null
{
    if (!code.includes("<"))
    {
        return null;
    }
    const { program, errors } = parse(id, code);
    if (errors.length > 0)
    {
        return null;
    }
    const lowering = new Lowering(code);
    const edits: Edit[] = [];
    lowering.collect(program as unknown as AstNode, 0, edits);
    if (edits.length === 0)
    {
        return null;
    }
    edits.push({ start: 0, end: 0, text: `import { html as ${HTML_BINDING} } from "zerolith"; ` });
    const output = applyEdits(code, edits);
    return { code: output, map: identityMap(id, code, output) };
}
