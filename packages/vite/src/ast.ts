/**
 * What the plugin's rewrites share: a walk over ESTree nodes, where an
 * import may go, text edits applied by offset, and the line-preserving
 * identity source map.
 */

/** What every ESTree node carries. */
export interface AstNode
{
    /** The ESTree node type, such as `CallExpression`; `walk` treats any object with a string `type` as a node. */
    type: string;
    /** Offset of the node's first character, as an index into the parsed code. */
    start: number;
    /** Offset just past the node's last character, so `code.slice(start, end)` is the node's source text. */
    end: number;
}

/** One replacement of a source range; a zero-length range inserts. */
export interface Edit
{
    /** Offset where the replaced range starts, as an index into the code the edit applies to. */
    start: number;
    /** Offset just past the last character replaced; equal to `start` for an insertion. */
    end: number;
    /** The text written in place of the range; empty to delete it. */
    text: string;
}

/** A line-preserving source map: every output line maps to the same input line. */
export interface IdentityMap
{
    /** The version of the source map format, always the integer 3. */
    version: 3;
    /** The original sources the mappings refer to by index; the identity map lists only the module's id. */
    sources: string[];
    /** The symbol names the mappings refer to by index; empty, since no segment of an identity map names a symbol. */
    names: string[];
    /** The encoded mapping data: one group of Base64 VLQ segments per generated line, groups separated by `;` and segments by `,`; the identity map writes one segment per line. */
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

/**
 * The offset just past a module's directive prologue, such as `"use strict";`
 * or `"use client";`, where an added import goes, since a directive stays a
 * directive only before every other statement; 0 for a module with none.
 */
export function prologueEnd(program: { body: readonly AstNode[] }): number
{
    let end = 0;
    for (const statement of program.body)
    {
        if (statement.type !== "ExpressionStatement" || typeof (statement as AstNode & { directive?: unknown }).directive !== "string")
        {
            break;
        }
        end = statement.end;
    }
    return end;
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
