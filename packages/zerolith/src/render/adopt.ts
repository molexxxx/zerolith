/**
 * Hydration's half of the renderer: taking over the nodes the server
 * rendered for a value in place of creating them, and repairing what does
 * not match, for a part, a list, and a branch. `hydrate` installs
 * `adopter` before it hands out the first cursor, and nothing else imports
 * this module, so a bundler leaves it out of a page that only renders.
 */
import { describe, isNothing, isText } from "../binding.js";
import { fail } from "../diagnostics.js";
import { isSignal, recall, restore, startEffect } from "../signals.js";
import { CHILD, type Prepared, prepare, walker } from "../template.js";
import { elementPart } from "./attributes.js";
import { type Adopting, ChildPart, Instance, type RowMarkers, edgesOf } from "./instance.js";
import { anchorBefore, isStart, matchingEnd, mismatch, removeUntil } from "./markers.js";
import { type BoundPart, Directive, RawHtml, TemplateResult } from "./view.js";

/** Binds the template's parts to server-rendered nodes between `cursor` and `anchor`, or returns undefined when they do not line up. */
function adoptInstance(strings: TemplateStringsArray, prepared: Prepared, cursor: ChildNode, anchor: Node): Instance | undefined
{
    const nodes: ChildNode[] = [];
    for (let node: ChildNode | null = cursor; node !== anchor; node = node.nextSibling)
    {
        if (node === null)
        {
            return undefined;
        }
        nodes.push(node);
    }
    const parts: BoundPart[] = [];
    const cursors = new Map<BoundPart, ChildNode>();
    const expected = walker(prepared.model);
    let index = 0;
    let next = 0;
    let broken = false;

    /** Advances through the template's own nodes in lockstep and checks the served node has the same shape. */
    const matches = (node: Node): boolean =>
    {
        const model = expected.nextNode();
        if (model === null || model.nodeType !== node.nodeType)
        {
            return false;
        }
        if (node.nodeType === 1)
        {
            return (model as Element).localName === (node as Element).localName;
        }
        const data = (node as Comment).data;
        return isStart(node) ? (model as Comment).data === "zl$" : (model as Comment).data === data;
    };

    const visit = (first: ChildNode | null, last: Node | null): void =>
    {
        for (let node = first; node !== null && node !== last && !broken; node = node.nextSibling)
        {
            if (node.nodeType !== 1 && node.nodeType !== 8)
            {
                continue;
            }
            if (!matches(node))
            {
                broken = true;
                return;
            }
            if (node.nodeType === 8)
            {
                if (isStart(node))
                {
                    const spec = prepared.parts[next];
                    const end = matchingEnd(node);
                    if (spec === undefined || spec.kind !== CHILD || spec.index !== index || end === undefined)
                    {
                        broken = true;
                        return;
                    }
                    const part = new ChildPart(end);
                    parts.push(part);
                    cursors.set(part, node.nextSibling ?? end);
                    next++;
                    index++;
                    node = end;
                    continue;
                }
                index++;
                continue;
            }
            for (let spec = prepared.parts[next]; spec !== undefined && spec.index === index; spec = prepared.parts[next])
            {
                if (spec.kind === CHILD)
                {
                    broken = true;
                    return;
                }
                parts.push(elementPart(node as Element, spec));
                next++;
            }
            index++;
            visit(node.firstChild, null);
        }
    };
    visit(cursor, anchor);
    if (broken || next !== prepared.parts.length || expected.nextNode() !== null)
    {
        return undefined;
    }
    return new Instance(strings, parts, nodes, undefined, cursors, prepared.edges ? edgesOf(parts, cursor.parentNode) : undefined);
}

/** Takes over the server-rendered nodes from `cursor` to the anchor for `value`, repairing any disagreement. */
function adoptChild(part: ChildPart, value: unknown, cursor: ChildNode): void
{
    const anchor = part.marker();
    if (isNothing(value))
    {
        if (cursor !== anchor)
        {
            mismatch("extra", "", cursor.nodeName);
            removeUntil(cursor, anchor);
        }
        return;
    }
    if (isText(value))
    {
        const text = String(value);
        if (text === "" && cursor === anchor)
        {
            part.apply(value);
            return;
        }
        if (cursor.nodeType === 3 && cursor.nextSibling === anchor)
        {
            const node = cursor as Text;
            if (node.data !== text)
            {
                mismatch("text", text, node.data);
                node.data = text;
            }
            part.text = node;
            return;
        }
        mismatch("missing", text, cursor === anchor ? "" : cursor.nodeName);
        removeUntil(cursor, anchor);
        part.apply(value);
        return;
    }
    if (value instanceof TemplateResult)
    {
        const instance = adoptInstance(value.strings, prepare(value.strings), cursor, anchor);
        if (instance !== undefined)
        {
            part.instance = instance;
            instance.update(value.values);
            return;
        }
        mismatch("structure", "template", cursor === anchor ? "" : cursor.nodeName);
        removeUntil(cursor, anchor);
        part.apply(value);
        return;
    }
    if (value instanceof Directive)
    {
        const provided = recall(value);
        try
        {
            part.controller = value.mount(part, cursor);
        }
        finally
        {
            restore(provided);
        }
        return;
    }
    if (value instanceof RawHtml)
    {
        const nodes: ChildNode[] = [];
        for (let node: ChildNode | null = cursor; node !== null && node !== anchor; node = node.nextSibling)
        {
            nodes.push(node);
        }
        part.raw = nodes;
        return;
    }
    if (isSignal(value))
    {
        let first = true;
        startEffect(() =>
        {
            const current = value.get();
            if (first)
            {
                first = false;
                adoptChild(part, current, cursor);
            }
            else
            {
                part.apply(current);
            }
        });
        return;
    }
    if (typeof value === "object" && Symbol.iterator in value)
    {
        const items: ChildPart[] = [];
        let node: ChildNode = cursor;
        for (const item of value as Iterable<unknown>)
        {
            const end = isStart(node) ? matchingEnd(node) : undefined;
            if (end === undefined)
            {
                mismatch("missing", "item", node === anchor ? "" : node.nodeName);
                if (node !== anchor)
                {
                    mismatch("extra", "", node.nodeName);
                    removeUntil(node, anchor);
                    node = anchor;
                }
                const child = new ChildPart(anchorBefore(anchor));
                items.push(child);
                child.set(item);
                continue;
            }
            const child = new ChildPart(end);
            items.push(child);
            child.set(item, node.nextSibling ?? end);
            node = end.nextSibling ?? anchor;
        }
        if (node !== anchor)
        {
            mismatch("extra", "", node.nodeName);
            removeUntil(node, anchor);
        }
        part.items = items;
        return;
    }
    if (typeof Node !== "undefined" && value instanceof Node)
    {
        mismatch("structure", "node", cursor === anchor ? "" : cursor.nodeName);
        if (cursor !== anchor)
        {
            removeUntil(cursor, anchor);
        }
        part.apply(value);
        return;
    }
    throw fail("unrenderable_value", { type: describe(value) });
}

/** The closing marker of the branch `cursor` opens, or undefined, reported as missing, with the nodes from `cursor` up to `end` removed. */
function adoptBranch(cursor: ChildNode, end: Comment): Comment | undefined
{
    const innerEnd = isStart(cursor) ? matchingEnd(cursor) : undefined;
    if (innerEnd === undefined)
    {
        mismatch("missing", "branch", cursor === end ? "" : cursor.nodeName);
        removeUntil(cursor, end);
    }
    return innerEnd;
}

/** Removes what follows a branch's closing marker `after` up to `end`, reported as extra. */
function trimBranch(after: Comment, end: Comment): void
{
    if (after.nextSibling !== end)
    {
        mismatch("extra", "", after.nextSibling?.nodeName ?? "");
        removeUntil(after.nextSibling as ChildNode, end);
    }
}

/** Removes the nodes between a branch's markers. */
function emptyBranch(start: ChildNode, end: Comment): void
{
    removeUntil(start.nextSibling as ChildNode, end);
}

/**
 * Takes over the rows the server rendered from `cursor` up to `end`, in
 * the list's order. At the first row whose markers are missing, the
 * server's nodes from there to `end` are removed, reported as extra, and
 * that row and each one after it are made anew, each reported as missing.
 * The server's rows past the list are removed, reported as extra. Each
 * row's key is read before its markers are looked at.
 */
function adoptRows<T>(cursor: ChildNode, end: Comment, list: readonly T[], key: (value: T, index: number) => unknown, create: (key: unknown, value: T, index: number, markers?: RowMarkers) => void): void
{
    let node: ChildNode = cursor;
    for (let i = 0; i < list.length; i++)
    {
        const value = list[i] as T;
        const rowKey = key(value, i);
        const rowStart = isStart(node) ? node : undefined;
        const rowEnd = rowStart === undefined ? undefined : matchingEnd(rowStart);
        if (rowStart === undefined || rowEnd === undefined)
        {
            mismatch("missing", "row", node === end ? "" : node.nodeName);
            if (node !== end)
            {
                mismatch("extra", "", node.nodeName);
                removeUntil(node, end);
                node = end;
            }
            create(rowKey, value, i);
            continue;
        }
        create(rowKey, value, i, { start: rowStart, end: rowEnd });
        node = rowEnd.nextSibling ?? end;
    }
    if (node !== end)
    {
        mismatch("extra", "", node.nodeName);
        removeUntil(node, end);
    }
}

/** Hydration's half of the renderer, which `hydrate` installs with `adoptWith`. */
export const adopter: Adopting = { child: adoptChild, branch: adoptBranch, trim: trimBranch, empty: emptyBranch, rows: adoptRows };
