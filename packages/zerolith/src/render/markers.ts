/**
 * Hydration markers: the comments the server wraps every child part in,
 * the walk that pairs them, and the record of each place where the
 * server-rendered markup and the view disagreed.
 */
import { diagnostic, report } from "../diagnostics.js";

/** One place where the server-rendered markup and the view disagreed. */
export interface HydrationMismatch
{
    /** `text`: a text node differed; `missing`: expected nodes were absent; `extra`: unexpected nodes were present; `structure`: a template's nodes did not line up; `root`: no server-rendered part was found. */
    kind: "text" | "missing" | "extra" | "structure" | "root";
    /** What was expected, when known. */
    expected?: string;
    /** What was found, when known. */
    found?: string;
}

/** Comment data that opens a server-rendered child part. */
export const PART_START: string = "zl:p";

/** Comment data that closes a server-rendered child part. */
export const PART_END: string = "/zl:p";

/** A new empty comment inserted before `node`, as the anchor of a part created there. */
export function anchorBefore(node: Node): Comment
{
    const comment = document.createComment("");
    node.parentNode?.insertBefore(comment, node);
    return comment;
}

let mismatches: HydrationMismatch[] | undefined;

/** Collects the mismatches `hydrate` finds into `found` until the matching call restores the previous collector; returns the previous one. */
export function collect(found: HydrationMismatch[] | undefined): HydrationMismatch[] | undefined
{
    const previous = mismatches;
    mismatches = found;
    return previous;
}

/** Records one disagreement for the hydration in progress and reports it as a `hydration_mismatch` warning. */
export function mismatch(kind: HydrationMismatch["kind"], expected?: string, found?: string): void
{
    const record: HydrationMismatch = { kind };
    if (expected !== undefined)
    {
        record.expected = expected;
    }
    if (found !== undefined)
    {
        record.found = found;
    }
    mismatches?.push(record);
    report(diagnostic("hydration_mismatch", "warning", { kind, expected: expected ?? "", found: found ?? "" }));
}

/** True for the comment that opens a server-rendered child part. */
export function isStart(node: Node | null): node is Comment
{
    return node !== null && node.nodeType === 8 && (node as Comment).data === PART_START;
}

/** The first part marker among the children of `container`, where server-rendered markup begins. */
export function firstStart(container: Node): Comment | undefined
{
    for (let node = container.firstChild; node !== null; node = node.nextSibling)
    {
        if (isStart(node))
        {
            return node;
        }
    }
    return undefined;
}

/** True when `container` holds markup `renderToString` wrote, which `hydrate` attaches to. */
export function hasServerMarkup(container: Node): boolean
{
    return firstStart(container) !== undefined;
}

function isEnd(node: Node | null): node is Comment
{
    return node !== null && node.nodeType === 8 && (node as Comment).data === PART_END;
}

/** The closing marker that matches an opening one, skipping nested pairs. */
export function matchingEnd(start: Comment): Comment | undefined
{
    let depth = 1;
    for (let node = start.nextSibling; node !== null; node = node.nextSibling)
    {
        if (isStart(node))
        {
            depth++;
        }
        else if (isEnd(node))
        {
            depth--;
            if (depth === 0)
            {
                return node;
            }
        }
    }
    return undefined;
}

/** Removes `from` and its following siblings up to, not including, `until`. */
export function removeUntil(from: ChildNode, until: Node): void
{
    let node: ChildNode | null = from;
    while (node !== null && node !== until)
    {
        const next: ChildNode | null = node.nextSibling;
        node.remove();
        node = next;
    }
}
