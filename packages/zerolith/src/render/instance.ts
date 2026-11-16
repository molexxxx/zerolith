/**
 * A template instance and its child parts. An instance clones a prepared
 * template once and binds one part per expression; a child part displays
 * one value before its marker and creates a nested instance for a
 * template value, so the two create each other and live in one module.
 */
import { describe, isNothing, isText } from "../binding.js";
import { fail } from "../diagnostics.js";
import { type Disposable, type Sink, createOwner, isSignal, recall, restore, startBinding, startEffect } from "../signals.js";
import { CHILD, EVENT, PROPERTY, type PartSpec, type Prepared, REF, prepare, trusted } from "../template.js";
import { elementPart } from "./attributes.js";
import { anchorBefore } from "./markers.js";
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

    /**
     * Clones the template and makes a part for each expression, for `update`
     * to bind. With `values`, it binds them to the copy in place of making
     * parts, for a view that is shown once and never given other values, as
     * a row of `each` is, whose template has no part at its top level, and
     * returns the one top-level node in place of an instance when there is
     * only one.
     *
     * Such values are bound in the order of their expressions, each as the
     * walk reaches its node. The walk counts child nodes, so nothing may
     * change the copy before it ends, and only the application's code
     * could, through one of the copy's nodes: the copy is in no document,
     * so that code gets a node only from a `ref`, a property's setter, a
     * custom element's callback, or content a binding puts in the copy.
     * From the first value that could give it one, a `ref`, a property, or
     * content that is not plain text, the walk only finds the remaining
     * nodes, and their values are bound once it ends; so are all the values
     * of a copy that holds a custom element.
     */
    static create(strings: TemplateStringsArray, prepared: Prepared, values?: readonly unknown[]): Instance | ChildNode
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
        const parts = values === undefined ? new Array<BoundPart>(specs.length) : NONE;
        /** For each part from `first` on, whose values are bound after the walk, its node and the node the walk stepped from to reach it. */
        let found: Node[] | undefined;
        let first = 0;
        let offset = 0;
        let node: Node = top;
        /** The node before `node` among its siblings when the walk stepped from it: the empty text node before a child part's marker. */
        let prior: Node = top;
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
                        prior = node;
                        node = nextSibling.call(node) as Node;
                    }
                }
                last = path;
            }
            const spec = specs[next] as PartSpec;
            if (values === undefined)
            {
                parts[next] = spec.kind !== CHILD
                    ? elementPart(node as Element, spec)
                    : unmarked[next] === true ? new ChildPart(null, node as Text) : new ChildPart(node as Comment, prior as Text);
            }
            else if (found !== undefined)
            {
                found.push(node, prior);
            }
            else if (master === undefined || (spec.kind === CHILD ? !isText(values[offset]) : spec.kind === PROPERTY || spec.kind === REF))
            {
                found = [node, prior];
                first = next;
            }
            else
            {
                const value = values[offset];
                if (spec.kind === CHILD)
                {
                    ((unmarked[next] === true ? node : prior) as Text).data = String(value);
                }
                else if (spec.kind === EVENT && typeof value === "function")
                {
                    node.addEventListener(spec.name, value as EventListener);
                }
                else
                {
                    elementPart(node as Element, spec).bind(values, offset);
                }
                offset += spec.count;
            }
        }
        if (values !== undefined)
        {
            if (found !== undefined)
            {
                for (let next = first; next < specs.length; next++)
                {
                    const spec = specs[next] as PartSpec;
                    const at = (next - first) * 2;
                    bindOnce(found[at] as Node, found[at + 1] as Node, spec, unmarked[next] === true, values, offset);
                    offset += spec.count;
                }
            }
            if (nodes === undefined)
            {
                return content as ChildNode;
            }
        }
        return new Instance(strings, parts, nodes, content, undefined, prepared.edges && fragment !== undefined ? edgesOf(parts, fragment) : undefined);
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

/** The parts of an instance whose values were bound as it was created, which keeps none. */
const NONE: BoundPart[] = [];

/**
 * Binds one value of a view that is shown once to its node: text and a
 * function that handles an event are written to the node, and any other
 * value gets a part that nothing holds once it is bound. `prior` is the
 * empty text node before a child part's marker; a child part with no marker
 * has that text node as its `node`.
 */
function bindOnce(node: Node, prior: Node, spec: PartSpec, lone: boolean, values: readonly unknown[], offset: number): void
{
    const value = values[offset];
    if (spec.kind === CHILD)
    {
        const text = (lone ? node : prior) as Text;
        if (isText(value))
        {
            text.data = String(value);
        }
        else
        {
            new ChildPart(lone ? null : node as Comment, text).set(value);
        }
    }
    else if (spec.kind === EVENT && typeof value === "function")
    {
        node.addEventListener(spec.name, value as EventListener);
    }
    else
    {
        elementPart(node as Element, spec).bind(values, offset);
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
export function edgesOf(parts: readonly BoundPart[], parent: ParentNode | null): ChildPart[]
{
    return parts.filter((part): part is ChildPart => part instanceof ChildPart && part.anchor !== null && part.anchor.parentNode === parent);
}

/** Where a part rendered a watched array whole: the comment it put before the first item, the comment that ends it, and its items, the first an empty one that holds the opening comment, each ending in a comment of its own. */
export interface Slot
{
    readonly start: Comment;
    readonly end: Comment;
    readonly items: readonly ChildPart[];
}

/** Where the part that last rendered each watched array put it; made by the first `watchSlot`, so rendering an array costs one check until then. */
let slots: WeakMap<object, Slot | null> | undefined;

/** Has the part that next renders `nodes` whole, as `${children}` does in a custom element's view, mark where it puts them. Internal to the runtime packages. */
export function watchSlot(nodes: object): void
{
    (slots ??= new WeakMap()).set(nodes, null);
}

/** Where a part last rendered `nodes` whole, when one did. A part that has rendered again since took its comments out, so `start` no longer leads to `end`. Internal to the runtime packages. */
export function slotOf(nodes: object): Slot | undefined
{
    return slots?.get(nodes) ?? undefined;
}

/**
 * A position that displays one value, before its marker comment. A part
 * that is its element's only child has no marker while it shows text or
 * nothing, which it does in the one text node it starts with, and adds the
 * marker after that node when it first shows anything else.
 */
/** How a part takes over server-rendered nodes for a value: `adoptChild` of adopt.ts. */
export type Adopt = (part: ChildPart, value: unknown, cursor: ChildNode) => void;

/** Hydration's half of the renderer, once `hydrate` has installed it. A part is given a cursor only under `hydrate`, so a page that only renders never calls it and bundles none of it. */
let adopt: Adopt | undefined;

/** Installs hydration's half of the renderer, before the first part is given a cursor. */
export function adoptWith(installed: Adopt): void
{
    adopt = installed;
}

export class ChildPart implements BoundPart, Sink
{
    readonly count: number = 1;
    /** The comment the content sits before; null while the part has no marker. */
    anchor: Comment | null;
    private owner: Disposable | undefined = undefined;
    /** The server-rendered node a bound signal's first value adopts, until that value is written. */
    private pending: ChildNode | undefined = undefined;
    instance: Instance | undefined = undefined;
    text: Text | undefined = undefined;
    private node: ChildNode | undefined = undefined;
    raw: ChildNode[] | undefined = undefined;
    items: ChildPart[] | undefined = undefined;
    controller: Controller | undefined = undefined;

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
                (adopt as Adopt)(this, value, cursor);
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
                (adopt as Adopt)(this, value, cursor);
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
            (adopt as Adopt)(this, value, start);
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

    /** Displays `value` in place of what the part shows, creating the nodes it needs. */
    apply(value: unknown): void
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
                instance = Instance.create(value.strings, prepare(value.strings)) as Instance;
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
            const start = slots?.has(value) === true ? anchorBefore(anchor) : undefined;
            if (start !== undefined)
            {
                items.push(new ChildPart(start));
            }
            for (const item of value as Iterable<unknown>)
            {
                const part = new ChildPart(anchorBefore(anchor));
                items.push(part);
                part.set(item);
            }
            this.items = items;
            if (start !== undefined)
            {
                (slots as WeakMap<object, Slot | null>).set(value, { start, end: anchor, items });
            }
            return;
        }
        throw fail("unrenderable_value", { type: describe(value) });
    }
}
