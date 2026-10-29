/**
 * What the plugin's rewrites share: a walk over ESTree nodes, text edits
 * applied by offset, and the line-preserving identity source map.
 */

/** What every ESTree node carries. */
export interface AstNode
{
    type: string;
    start: number;
    end: number;
}

/** One replacement of a source range; a zero-length range inserts. */
export interface Edit
{
    start: number;
    end: number;
    text: string;
}

/** A line-preserving source map: every output line maps to the same input line. */
export interface IdentityMap
{
    version: 3;
    sources: string[];
    names: string[];
    mappings: string;
}

/** Visits every node under `value`, depth first; a visitor returning false skips the node's children. */
export function walk(value: unknown, visit: (node: AstNode) => unknown): void
{
    if (Array.isArray(value))
    {
        for (const item of value)
        {
            walk(item, visit);
        }
        return;
    }
    if (value === null || typeof value !== "object")
    {
        return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record["type"] === "string" && visit(record as unknown as AstNode) === false)
    {
        return;
    }
    for (const [key, child] of Object.entries(record))
    {
        if (key !== "parent" && key !== "range" && key !== "loc" && typeof child === "object")
        {
            walk(child, visit);
        }
    }
}

/** Applies non-overlapping edits to `code`; inserts at one offset keep their order. */
export function applyEdits(code: string, edits: readonly Edit[]): string
{
    const ordered = edits.toSorted((a, b) => a.start - b.start || a.end - b.end);
    let out = "";
    let cursor = 0;
    for (const edit of ordered)
    {
        if (edit.start < cursor)
        {
            throw new Error(`zerolith: overlapping rewrite at ${edit.start}`);
        }
        out += code.slice(cursor, edit.start) + edit.text;
        cursor = edit.end;
    }
    return out + code.slice(cursor);
}

/** The identity map for an output whose lines line up with the input's; extra output lines map to the last input line. */
export function identityMap(id: string, original: string, output: string): IdentityMap
{
    const originalLines = original.split("\n").length;
    const outputLines = output.split("\n").length;
    const segments: string[] = [];
    for (let line = 0; line < outputLines; line++)
    {
        segments.push(line > 0 && line < originalLines ? "AACA" : "AAAA");
    }
    return { version: 3, sources: [id], names: [], mappings: segments.join(";") };
}
