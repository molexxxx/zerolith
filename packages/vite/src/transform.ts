/**
 * The source rewrite behind the plugin, kept free of Vite so it can run on
 * any parser that produces ESTree nodes with `start` and `end` offsets. It
 * never adds or removes a line inside the module, so line numbers in stack
 * traces still point at the author's file, and it returns an identity source
 * map for the lines it keeps.
 */

import { type AstNode, type Edit, type IdentityMap, applyEdits, identityMap, walk } from "./ast.js";

export type { AstNode } from "./ast.js";

/** The module the rewritten code imports; resolved by Vite from the application's `node_modules`. */
export const RUNTIME_SPECIFIER: string = "@zerolith/vite/runtime";

const BINDING = "__zl$";
const FOOTER = `if (import.meta.hot) { import.meta.hot.dispose(${BINDING}.save); import.meta.hot.accept(${BINDING}.accept); }`;

/** A parsed module: the program body and any syntax errors the parser reported. */
export interface ParsedModule
{
    program: { body: readonly AstNode[] };
    errors: readonly unknown[];
}

/** Parses JavaScript module text; the plugin passes Vite's `parseSync`. */
export type ModuleParser = (filename: string, code: string) => ParsedModule;

/** The rewritten module and its line-preserving source map. */
export interface TransformOutput
{
    code: string;
    map: IdentityMap;
}

interface Identifier extends AstNode
{
    type: "Identifier";
    name: string;
}

interface FunctionDeclaration extends AstNode
{
    type: "FunctionDeclaration";
    id: Identifier | null;
}

interface VariableDeclarator extends AstNode
{
    type: "VariableDeclarator";
    id: AstNode & { name?: string };
    init: AstNode | null;
}

interface VariableDeclaration extends AstNode
{
    type: "VariableDeclaration";
    declarations: readonly VariableDeclarator[];
}

interface ExportSpecifier
{
    local: { name?: string; value?: string };
}

interface ExportNamedDeclaration extends AstNode
{
    type: "ExportNamedDeclaration";
    declaration: AstNode | null;
    specifiers: readonly ExportSpecifier[];
    source: unknown;
}

interface ExportDefaultDeclaration extends AstNode
{
    type: "ExportDefaultDeclaration";
    declaration: AstNode;
}

interface ImportSpecifier
{
    type: string;
    imported?: { name?: string; value?: string };
    local: { name: string };
}

interface ImportDeclaration extends AstNode
{
    type: "ImportDeclaration";
    source: { value: unknown };
    specifiers: readonly ImportSpecifier[];
}

interface CallExpression extends AstNode
{
    type: "CallExpression";
    callee: AstNode & { name?: string };
    arguments: readonly AstNode[];
}

function isComponentName(name: string): boolean
{
    const first = name.charAt(0);
    return first !== "" && first === first.toUpperCase() && first !== first.toLowerCase();
}

function isFunctionLike(node: AstNode | null): boolean
{
    return node !== null && (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression");
}

function registration(name: string): string
{
    return `var ${name} = ${BINDING}.component(import.meta.hot, "${name}", ${name}$);`;
}

/**
 * Rewrites one module for hot replacement. Exported functions whose names
 * start with a capital letter become proxies registered under the module's
 * `import.meta.hot.data`; calls to `render` and `hydrate` imported from
 * `zerolith` are routed through the runtime with the rendered expression
 * wrapped in a factory; and a module that needed either change accepts its
 * own updates. A module that needs neither comes back as `null`, untouched.
 */
export function transformModule(code: string, id: string, parse: ModuleParser): TransformOutput | null
{
    if (!code.includes("export") && !code.includes("zerolith"))
    {
        return null;
    }
    const { program, errors } = parse(id, code);
    if (errors.length > 0)
    {
        return null;
    }
    const edits: Edit[] = [];
    const head: string[] = [];
    const tail: string[] = [];
    const exportedLater = new Set<string>();
    let renderLocal: string | undefined;
    let hydrateLocal: string | undefined;

    for (const statement of program.body)
    {
        if (statement.type === "ExportNamedDeclaration")
        {
            const node = statement as ExportNamedDeclaration;
            if (node.declaration === null && node.source === null)
            {
                for (const specifier of node.specifiers)
                {
                    if (typeof specifier.local.name === "string")
                    {
                        exportedLater.add(specifier.local.name);
                    }
                }
            }
        }
        else if (statement.type === "ImportDeclaration")
        {
            const node = statement as ImportDeclaration;
            if (node.source.value !== "zerolith")
            {
                continue;
            }
            for (const specifier of node.specifiers)
            {
                if (specifier.type !== "ImportSpecifier")
                {
                    continue;
                }
                const imported = specifier.imported?.name ?? specifier.imported?.value;
                if (imported === "render")
                {
                    renderLocal = specifier.local.name;
                }
                else if (imported === "hydrate")
                {
                    hydrateLocal = specifier.local.name;
                }
            }
        }
    }

    const renameFunction = (declaration: FunctionDeclaration): string | undefined =>
    {
        const identifier = declaration.id;
        if (identifier === null || !isComponentName(identifier.name))
        {
            return undefined;
        }
        edits.push({ start: identifier.start, end: identifier.end, text: `${identifier.name}$` });
        head.push(registration(identifier.name));
        return identifier.name;
    };

    const renameDeclarators = (declaration: VariableDeclaration): string[] =>
    {
        const names: string[] = [];
        const registered: string[] = [];
        for (const declarator of declaration.declarations)
        {
            if (declarator.id.type !== "Identifier" || typeof declarator.id.name !== "string")
            {
                continue;
            }
            const name = declarator.id.name;
            names.push(name);
            if (isComponentName(name) && isFunctionLike(declarator.init))
            {
                edits.push({ start: declarator.id.start, end: declarator.id.end, text: `${name}$` });
                registered.push(registration(name));
            }
        }
        if (registered.length > 0)
        {
            edits.push({ start: declaration.end, end: declaration.end, text: `; ${registered.join(" ")}` });
        }
        return names;
    };

    for (const statement of program.body)
    {
        if (statement.type === "ExportNamedDeclaration")
        {
            const node = statement as ExportNamedDeclaration;
            const declaration = node.declaration;
            if (declaration?.type === "FunctionDeclaration")
            {
                const name = renameFunction(declaration as FunctionDeclaration);
                if (name !== undefined)
                {
                    edits.push({ start: node.start, end: declaration.start, text: "" });
                    tail.push(`export { ${name} };`);
                }
            }
            else if (declaration?.type === "VariableDeclaration")
            {
                const before = edits.length;
                const names = renameDeclarators(declaration as VariableDeclaration);
                if (edits.length > before)
                {
                    edits.push({ start: node.start, end: declaration.start, text: "" });
                    tail.push(`export { ${names.join(", ")} };`);
                }
            }
        }
        else if (statement.type === "ExportDefaultDeclaration")
        {
            const node = statement as ExportDefaultDeclaration;
            if (node.declaration.type === "FunctionDeclaration")
            {
                const name = renameFunction(node.declaration as FunctionDeclaration);
                if (name !== undefined)
                {
                    edits.push({ start: node.start, end: node.declaration.start, text: "" });
                    tail.push(`export default ${name};`);
                }
            }
        }
        else if (statement.type === "FunctionDeclaration")
        {
            const node = statement as FunctionDeclaration;
            if (node.id !== null && exportedLater.has(node.id.name))
            {
                renameFunction(node);
            }
        }
        else if (statement.type === "VariableDeclaration")
        {
            const node = statement as VariableDeclaration;
            if (node.declarations.some((declarator) => typeof declarator.id.name === "string" && exportedLater.has(declarator.id.name)))
            {
                renameDeclarators(node);
            }
        }
    }

    if (renderLocal !== undefined || hydrateLocal !== undefined)
    {
        walk(program.body, (node) =>
        {
            if (node.type !== "CallExpression")
            {
                return;
            }
            const call = node as CallExpression;
            const target = call.callee.type === "Identifier" ? call.callee.name : undefined;
            const replacement = target !== undefined && target === renderLocal ? "render" : target !== undefined && target === hydrateLocal ? "hydrate" : undefined;
            const first = call.arguments[0];
            if (replacement === undefined || first === undefined || first.type === "SpreadElement" || call.arguments.length < 2)
            {
                return;
            }
            edits.push({ start: call.callee.start, end: call.callee.end, text: `${BINDING}.${replacement}` });
            edits.push({ start: first.start, end: first.start, text: "() => (" });
            edits.push({ start: first.end, end: first.end, text: ")" });
        });
    }

    if (edits.length === 0)
    {
        return null;
    }
    edits.push({ start: 0, end: 0, text: `import * as ${BINDING} from "${RUNTIME_SPECIFIER}"; ${head.join(" ")}${head.length > 0 ? " " : ""}` });
    const body = applyEdits(code, edits);
    const output = `${body}${body.endsWith("\n") ? "" : "\n"}${tail.length > 0 ? `${tail.join(" ")}\n` : ""}${FOOTER}`;
    return { code: output, map: identityMap(id, code, output) };
}
