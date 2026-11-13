/**
 * A template instance and its child parts. An instance clones a prepared
 * template once and binds one part per expression; a child part displays
 * one value before its marker and creates a nested instance for a
 * template value, so the two create each other and live in one module.
 */
import { describe, isNothing, isText } from "../binding.js";
import { fail } from "../diagnostics.js";
import { type Disposable, type Sink, createOwner, isSignal, recall, restore, startBinding, startEffect } from "../signals.js";
import { CHILD, type PartSpec, type Prepared, prepare, trusted, walker } from "../template.js";
import { elementPart } from "./attributes.js";
import { anchorBefore, isStart, matchingEnd, mismatch, removeUntil } from "./markers.js";
import { type BoundPart, type Controller, Directive, RawHtml, TemplateResult } from "./view.js";

/** A clone of one template with its parts bound, or the server-rendered nodes of one adopted in place. */
export class Instance
{
    readonly strings: TemplateStringsArray;
    /** What inserting a created instance puts in the page: its one top-level node, or a fragment holding several. */
    readonly content: Node | undefined;
    /** The top-level nodes, when there are none or several; undefined when the one top-level node is `content`. */
    readonly nodes: readonly ChildNode[] | undefined;
    private readonly parts: readonly BoundPart[];
    private cursors: ReadonlyMap<BoundPart, ChildNode> | undefined;
    /** The child parts among the template's top-level nodes, whose content `nodes` does not hold. */
    private readonly edges: readonly ChildPart[] | undefined;

    constructor(strings: TemplateStringsArray, parts: readonly BoundPart[], nodes: readonly ChildNode[] | undefined, content: Node | undefined, cursors: ReadonlyMap<BoundPart, ChildNode> | undefined, edges: readonly ChildPart[] | undefined)
    {
        this.strings = strings;
        this.parts = parts;
        this.nodes = nodes;
        this.content = content;
        this.cursors = cursors;
        this.edges = edges;
    }

    /** Clones the template and binds its parts. */
    static create(strings: TemplateStringsArray, prepared: Prepared): Instance
    {
        const firstChild = firstChildOf ??= getter("firstChild");
        const nextSibling = nextSiblingOf ??= getter("nextSibling");
        const { master, parts: specs, paths, unmarked } = prepared;
        let top: Node;
        let from = 0;
        let nodes: ChildNode[] | undefined;
        let content: Node;
        let fragment: DocumentFragment | undefined;
        if (master !== undefined && master.nodeType !== 11)
        {
            const root = master.cloneNode(true) as ChildNode;
            top = root;
            from = 1;
            nodes = undefined;
            content = root;
        }
        else
        {
            fragment = (master === undefined ? document.importNode(prepared.content, true) : master.cloneNode(true)) as DocumentFragment;
            top = fragment;
            const first = fragment.firstChild;
            if (first !== null && first.nextSibling === null)
            {
                nodes = undefined;
                content = first;
            }
            else
            {
                nodes = Array.from(fragment.childNodes);
                content = fragment;
            }
        }
        const parts = new Array<BoundPart>(specs.length);
        let node: Node = top;
        let last: readonly number[] | undefined;
        for (let next = 0; next < specs.length; next++)
        {
            const path = paths[next] as readonly number[];
            if (path !== last)
            {
                node = top;
                for (let depth = from; depth < path.length; depth++)
                {
                    node = firstChild.call(node) as Node;
                    for (let step = path[depth] as number; step > 0; step--)
                    {
                        node = nextSibling.call(node) as Node;
                    }
                }
                last = path;
            }
            const spec = specs[next] as PartSpec;
            if (spec.kind !== CHILD)
            {
                parts[next] = elementPart(node as Element, spec);
            }
            else if (unmarked[next] === true)
            {
                parts[next] = new ChildPart(null, node as Text);
            }
            else
            {
                parts[next] = new ChildPart(node as Comment, node.previousSibling as Text);
            }
        }
        return new Instance(strings, parts, nodes, content, undefined, prepared.edges && fragment !== undefined ? edgesOf(parts, fragment) : undefined);
    }

    /** Binds the template's parts to server-rendered nodes between `cursor` and `anchor`, or returns undefined when they do not line up. */
    static adopt(strings: TemplateStringsArray, prepared: Prepared, cursor: ChildNode, anchor: Node): Instance | undefined
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

    update(values: readonly unknown[]): void
    {
        const cursors = this.cursors;
        this.cursors = undefined;
        let offset = 0;
        for (const part of this.parts)
        {
            const cursor = cursors?.get(part);
            if (cursor !== undefined && part instanceof ChildPart)
            {
                part.set(values[offset], cursor);
            }
            else
            {
                part.bind(values, offset);
            }
            offset += part.count;
        }
    }

    remove(): void
    {
        if (this.edges !== undefined)
        {
            for (const part of this.edges)
            {
                part.clear();
            }
        }
        if (this.nodes === undefined)
        {
            (this.content as ChildNode).remove();
            return;
        }
        for (const node of this.nodes)
        {
            node.remove();
        }
    }
}

type Step = (this: Node) => ChildNode | null;

let firstChildOf: Step | undefined;

let nextSiblingOf: Step | undefined;

/** A getter of `Node.prototype`, called directly in a walk, where a property read would meet a different node type at every step. */
function getter(name: "firstChild" | "nextSibling"): Step
{
    return (Object.getOwnPropertyDescriptor(Node.prototype, name) as PropertyDescriptor).get as Step;
}

/** The child parts whose anchors are direct children of `parent`. */
function edgesOf(parts: readonly BoundPart[], parent: ParentNode | null): ChildPart[]
{
    return parts.filter((part): part is ChildPart => part instanceof ChildPart && part.anchor !== null && part.anchor.parentNode === parent);
}

/**
 * A position that displays one value, before its marker comment. A part
 * that is its element's only child has no marker while it shows text or
 * nothing, which it does in the one text node it starts with, and adds the
 * marker after that node when it first shows anything else.
 */
export class ChildPart implements BoundPart, Sink
{
    readonly count: number = 1;
    /** The comment the content sits before; null while the part has no marker. */
    anchor: Comment | null;
    private owner: Disposable | undefined = undefined;
    /** The server-rendered node a bound signal's first value adopts, until that value is written. */
    private pending: ChildNode | undefined = undefined;
    private instance: Instance | undefined = undefined;
    private text: Text | undefined = undefined;
    private node: ChildNode | undefined = undefined;
    private raw: ChildNode[] | undefined = undefined;
    private items: ChildPart[] | undefined = undefined;
    private controller: Controller | undefined = undefined;

    /** With `text`, the part starts with that empty text node, before the anchor or, without one, as its element's only child, which a text value fills. */
    constructor(anchor: Comment | null, text?: Text)
    {
        this.anchor = anchor;
        this.text = text;
    }

    /** The comment the content sits before, added after the part's text node when the part has none. */
    marker(): Comment
    {
        let anchor = this.anchor;
        if (anchor === null)
        {
            const text = this.text as Text;
            anchor = document.createComment("");
            text.parentNode?.insertBefore(anchor, text.nextSibling);
            this.anchor = anchor;
        }
        return anchor;
    }

    bind(values: readonly unknown[], offset: number): void
    {
        this.set(values[offset]);
    }

    /** Replaces the displayed value, disposing whatever the previous value created. With `cursor`, adopts the server-rendered nodes starting there instead of creating new ones. */
    set(value: unknown, cursor?: ChildNode): void
    {
        this.owner?.dispose();
        this.owner = undefined;
        this.pending = undefined;
        if (isSignal(value))
        {
            this.pending = cursor;
            this.owner = startBinding(value, this);
            return;
        }
        if (isNothing(value) || isText(value))
        {
            if (cursor !== undefined)
            {
                this.adopt(value, cursor);
            }
            else
            {
                this.apply(value);
            }
            return;
        }
        const owner = createOwner();
        this.owner = owner;
        owner.run(() =>
        {
            if (cursor !== undefined)
            {
                this.adopt(value, cursor);
            }
            else
            {
                this.apply(value);
            }
        });
    }

    /** Writes a bound signal's value: the first one adopts the server-rendered nodes when `set()` was given a cursor, every later one replaces what is displayed. */
    receive(value: unknown): void
    {
        const start = this.pending;
        if (start !== undefined)
        {
            this.pending = undefined;
            this.adopt(value, start);
            return;
        }
        this.apply(value);
    }

    /** Removes the displayed nodes; a part with no marker empties its text node instead, which keeps its place. Effects are owned by `set()` and disposed there. */
    clear(): void
    {
        if (this.controller !== undefined)
        {
            this.controller.dispose();
            this.controller = undefined;
        }
        if (this.items !== undefined)
        {
            for (const item of this.items)
            {
                item.clear();
                item.anchor?.remove();
            }
            this.items = undefined;
        }
        if (this.instance !== undefined)
        {
            this.instance.remove();
            this.instance = undefined;
        }
        if (this.node !== undefined)
        {
            this.node.remove();
            this.node = undefined;
        }
        if (this.raw !== undefined)
        {
            for (const node of this.raw)
            {
                node.remove();
            }
            this.raw = undefined;
        }
        if (this.text !== undefined)
        {
            if (this.anchor === null)
            {
                this.text.data = "";
            }
            else
            {
                this.text.remove();
                this.text = undefined;
            }
        }
    }

    /** Removes the displayed nodes and the anchor itself. */
    destroy(): void
    {
        this.owner?.dispose();
        this.owner = undefined;
        this.clear();
        this.anchor?.remove();
    }

    /** Takes over the server-rendered nodes from `cursor` to the anchor for `value`, repairing any disagreement. */
    private adopt(value: unknown, cursor: ChildNode): void
    {
        const anchor = this.marker();
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
                this.apply(value);
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
                this.text = node;
                return;
            }
            mismatch("missing", text, cursor === anchor ? "" : cursor.nodeName);
            removeUntil(cursor, anchor);
            this.apply(value);
            return;
        }
        if (value instanceof TemplateResult)
        {
            const instance = Instance.adopt(value.strings, prepare(value.strings), cursor, anchor);
            if (instance !== undefined)
            {
                this.instance = instance;
                instance.update(value.values);
                return;
            }
            mismatch("structure", "template", cursor === anchor ? "" : cursor.nodeName);
            removeUntil(cursor, anchor);
            this.apply(value);
            return;
        }
        if (value instanceof Directive)
        {
            const provided = recall(value);
            try
            {
                this.controller = value.mount(this, cursor);
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
            this.raw = nodes;
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
                    this.adopt(current, cursor);
                }
                else
                {
                    this.apply(current);
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
                    const part = new ChildPart(anchorBefore(anchor));
                    items.push(part);
                    part.set(item);
                    continue;
                }
                const part = new ChildPart(end);
                items.push(part);
                part.set(item, node.nextSibling ?? end);
                node = end.nextSibling ?? anchor;
            }
            if (node !== anchor)
            {
                mismatch("extra", "", node.nodeName);
                removeUntil(node, anchor);
            }
            this.items = items;
            return;
        }
        if (typeof Node !== "undefined" && value instanceof Node)
        {
            mismatch("structure", "node", cursor === anchor ? "" : cursor.nodeName);
            if (cursor !== anchor)
            {
                removeUntil(cursor, anchor);
            }
            this.apply(value);
            return;
        }
        throw fail("unrenderable_value", { type: describe(value) });
    }

    private apply(value: unknown): void
    {
        if (isNothing(value))
        {
            this.clear();
            return;
        }
        if (isText(value))
        {
            const text = String(value);
            if (this.text !== undefined)
            {
                this.text.data = text;
                return;
            }
            const anchor = this.marker();
            this.clear();
            this.text = document.createTextNode(text);
            anchor.parentNode?.insertBefore(this.text, anchor);
            return;
        }
        if (value instanceof TemplateResult)
        {
            if (this.instance !== undefined && this.instance.strings === value.strings)
            {
                this.instance.update(value.values);
                return;
            }
            const anchor = this.marker();
            this.clear();
            const provided = recall(value);
            let instance: Instance;
            try
            {
                instance = Instance.create(value.strings, prepare(value.strings));
                instance.update(value.values);
            }
            finally
            {
                restore(provided);
            }
            if (instance.content !== undefined)
            {
                anchor.parentNode?.insertBefore(instance.content, anchor);
            }
            this.instance = instance;
            return;
        }
        if (value instanceof Directive)
        {
            this.marker();
            this.clear();
            const provided = recall(value);
            try
            {
                this.controller = value.mount(this);
            }
            finally
            {
                restore(provided);
            }
            return;
        }
        if (value instanceof RawHtml)
        {
            const anchor = this.marker();
            this.clear();
            const template = document.createElement("template");
            template.innerHTML = trusted(value.markup);
            const nodes = Array.from(template.content.childNodes);
            anchor.parentNode?.insertBefore(template.content, anchor);
            this.raw = nodes;
            return;
        }
        if (isSignal(value))
        {
            startEffect(() =>
            {
                this.apply(value.get());
            });
            return;
        }
        if (typeof Node !== "undefined" && value instanceof Node)
        {
            const anchor = this.marker();
            this.clear();
            if (value.nodeType === 11)
            {
                const nodes = Array.from(value.childNodes);
                anchor.parentNode?.insertBefore(value, anchor);
                this.raw = nodes;
                return;
            }
            anchor.parentNode?.insertBefore(value, anchor);
            this.node = value as ChildNode;
            return;
        }
        if (typeof value === "object" && Symbol.iterator in value)
        {
            const anchor = this.marker();
            this.clear();
            const items: ChildPart[] = [];
            for (const item of value as Iterable<unknown>)
            {
                const part = new ChildPart(anchorBefore(anchor));
                items.push(part);
                part.set(item);
            }
            this.items = items;
            return;
        }
        throw fail("unrenderable_value", { type: describe(value) });
    }
}
