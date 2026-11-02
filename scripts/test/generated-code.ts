/**
 * What the randomized tests of the code generators share: text that would
 * declare, call, or interpolate `injected` if it escaped a string, a comment,
 * or a template in a generated module, and the check that finds such code in
 * the module's syntax tree.
 */
import * as fc from "fast-check";

/** Text that ends a string, a comment, or a template and declares, calls, or interpolates `injected` if it reaches code as it is. */
export const escapes: fc.Arbitrary<string> = fc.constantFrom(
    "\nexport const injected = 1;\n",
    "\r\nexport const injected = 1;\r\n",
    "\rexport const injected = 1;\r",
    `${String.fromCodePoint(0x2028)}export const injected = 1;`,
    `${String.fromCodePoint(0x2029)}export const injected = 1;`,
    "*/ export const injected = 1; /*",
    "\"; export const injected = 1; \"",
    "'; export const injected = 1; '",
    "`; export const injected = 1; `",
    "${injected}",
    "\\\"; export const injected = 1; //",
    "</script><script>injected()</script>"
);

/** Whether a node is the identifier the escapes name. */
function isInjected(node: unknown): boolean
{
    return typeof node === "object" && node !== null && (node as Record<string, unknown>)["type"] === "Identifier" && (node as Record<string, unknown>)["name"] === "injected";
}

/**
 * Whether a parsed module holds code only an escape can put there: a
 * declaration of `injected`, a call to it, or it as a template's expression.
 * A name a generator turns into a key, a type, or a function named
 * `injected` is not an escape.
 */
export function escaped(node: unknown): boolean
{
    if (Array.isArray(node))
    {
        return node.some(escaped);
    }
    if (node === null || typeof node !== "object")
    {
        return false;
    }
    const fields = node as Record<string, unknown>;
    const expressions = fields["expressions"];
    return (fields["type"] === "VariableDeclarator" && isInjected(fields["id"]))
        || (fields["type"] === "CallExpression" && isInjected(fields["callee"]))
        || (fields["type"] === "TemplateLiteral" && Array.isArray(expressions) && expressions.some(isInjected))
        || Object.values(fields).some(escaped);
}
