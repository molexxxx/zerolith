/**
 * Rendering: template instantiation with fine-grained parts. A template is
 * cloned once and each expression binds to one node; a signal in a part
 * subscribes that part alone, so an update touches one text node or
 * attribute and the component function never runs again.
 *
 * Hydration binds the same parts to markup the server rendered instead of
 * cloning: the server wraps every child part's content in comment markers,
 * and the client walks the existing nodes with the template's part indices.
 */
import { URL_ATTRIBUTES, describe, isNothing, isText, join, safeUrl } from "./binding.js";
import { measure, trackRoot, untrackRoot } from "./devtools.js";
import { diagnostic, fail, report } from "./diagnostics.js";
import { type Disposable, type Owner, type ReadableSignal, type Signal, createOwner, isSignal, onDispose, signal, startEffect, untracked } from "./signals.js";
import { ATTRIBUTE, BOOLEAN, CHILD, EVENT, type PartSpec, type Prepared, REF, prepare, trusted, walker } from "./template.js";

/** Brand carried by every value the renderer accepts as a description of UI. */
export const VIEW: unique symbol = Symbol("zerolith.view");

/** A description of UI produced by `html`, `each`, or `when`, or by a component function. */
export interface View
{
    readonly [VIEW]: true;
}

/** The handle returned by `render()`. */
export interface Root
{
    /** The element or fragment the view was rendered into. */
    readonly container: Element | DocumentFragment;
    /** Removes everything rendered and disposes every effect it created. */
    dispose(): void;
}

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

/** The handle returned by `hydrate()`. */
export interface HydrateResult extends Root
{
    /** Every disagreement found; each one was repaired by rendering on the client. */
    readonly mismatches: readonly HydrationMismatch[];
}

/** Comment data that opens a server-rendered child part. */
export const PART_START: string = "zl:p";
/** Comment data that closes a server-rendered child part. */
export const PART_END: string = "/zl:p";

interface Controller
{
    dispose(): void;
}

interface BoundPart
{
    readonly count: number;
    bind(values: readonly unknown[], offset: number): void;
}

/** The result of an `html` literal as the server renderer sees it. */
export interface TemplateView extends View
{
    readonly strings: TemplateStringsArray;
    readonly values: readonly unknown[];
}

class TemplateResult implements TemplateView
{
    readonly [VIEW]: true = true;
    readonly strings: TemplateStringsArray;
    readonly values: readonly unknown[];

    constructor(strings: TemplateStringsArray, values: readonly unknown[])
    {
        this.strings = strings;
        this.values = values;
    }
}

/** A view that controls its own part. `resolve` gives the server renderer the view to draw for the current state. */
abstract class Directive implements View
{
    readonly [VIEW]: true = true;
    abstract mount(part: ChildPart, cursor?: ChildNode): Controller;
    abstract resolve(): unknown;
    /** True when the server wraps the resolved view in its own part markers (a branch), false when it renders rows directly. */
    abstract readonly wrapsBranch: boolean;
}

/** Markup that is inserted as is, as the server renderer sees it. */
export interface RawView extends View
{
    readonly markup: string;
}

class RawHtml implements RawView
{
    readonly [VIEW]: true = true;
    readonly markup: string;

    constructor(markup: string)
    {
        this.markup = markup;
    }
}

/**
 * Marks a string as markup to insert without escaping. This is the one way
 * to put HTML you already trust into a view, for example content rendered
 * from Markdown you wrote. Never pass user input.
 */
export function unsafeHtml(markup: string): View
{
    return new RawHtml(markup);
}

/** True for the result of `unsafeHtml`. */
export function isRawHtml(value: unknown): value is RawView
{
    return value instanceof RawHtml;
}

/** True for the result of an `html` literal. */
export function isTemplate(value: unknown): value is TemplateView
{
    return value instanceof TemplateResult;
}

/** True for the views produced by `each` and `when`. */
export function isDirective(value: unknown): value is View
{
    return value instanceof Directive;
}

/** The view a directive would show for the current state, for renderers without a DOM. */
export function resolveDirective(view: View): unknown
{
    return (view as Directive).resolve();
}

/** True when the server must wrap a directive's resolved view in its own part markers. */
export function directiveWrapsBranch(view: View): boolean
{
    return (view as Directive).wrapsBranch;
}

/** Describes markup with live bindings. Values are bound as content or inside attribute values. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): View
{
    return new TemplateResult(strings, values);
}

function anchorBefore(node: Node): Comment
{
    const comment = document.createComment("");
    node.parentNode?.insertBefore(comment, node);
    return comment;
}

let mismatches: HydrationMismatch[] | undefined;

function mismatch(kind: HydrationMismatch["kind"], expected?: string, found?: string): void
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

function isStart(node: Node | null): node is Comment
{
    return node !== null && node.nodeType === 8 && (node as Comment).data === PART_START;
}

function isEnd(node: Node | null): node is Comment
{
    return node !== null && node.nodeType === 8 && (node as Comment).data === PART_END;
}

/** The closing marker that matches an opening one, skipping nested pairs. */
function matchingEnd(start: Comment): Comment | undefined
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

function removeUntil(from: ChildNode, until: Node): void
{
    let node: ChildNode | null = from;
    while (node !== null && node !== until)
    {
        const next: ChildNode | null = node.nextSibling;
        node.remove();
        node = next;
    }
}

class Instance
{
    readonly strings: TemplateStringsArray;
    /** What inserting a created instance puts in the page: its one top-level node, or a fragment holding several. */
    readonly content: Node | undefined;
    readonly nodes: readonly ChildNode[];
    private readonly parts: readonly BoundPart[];
    private readonly cursors: ReadonlyMap<BoundPart, ChildNode> | undefined;
    /** The child parts among the template's top-level nodes, whose content `nodes` does not hold. */
    private readonly edges: readonly ChildPart[] | undefined;

    constructor(strings: TemplateStringsArray, parts: readonly BoundPart[], nodes: readonly ChildNode[], content: Node | undefined, cursors: ReadonlyMap<BoundPart, ChildNode> | undefined, edges: readonly ChildPart[] | undefined)
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
        const { master, parts: specs, paths } = prepared;
        let top: Node;
        let from = 0;
        let nodes: ChildNode[];
        let content: Node;
        let fragment: DocumentFragment | undefined;
        if (master !== undefined && master.nodeType !== 11)
        {
            const root = master.cloneNode(true) as ChildNode;
            top = root;
            from = 1;
            nodes = [root];
            content = root;
        }
        else
        {
            fragment = (master === undefined ? document.importNode(prepared.content, true) : master.cloneNode(true)) as DocumentFragment;
            top = fragment;
            const first = fragment.firstChild;
            nodes = first === null ? [] : first.nextSibling === null ? [first] : Array.from(fragment.childNodes);
            content = first !== null && nodes.length === 1 ? first : fragment;
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
            parts[next] = spec.kind === CHILD ? new ChildPart(node as Comment, node.previousSibling as Text) : new AttributePart(node as Element, spec);
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
        const expected = walker(prepared.content);
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
                    parts.push(new AttributePart(node as Element, spec));
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
        let offset = 0;
        for (const part of this.parts)
        {
            const cursor = this.cursors?.get(part);
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
    return parts.filter((part): part is ChildPart => part instanceof ChildPart && part.anchor.parentNode === parent);
}

/** A position between two nodes that displays one value. */
class ChildPart implements BoundPart
{
    readonly count: number = 1;
    readonly anchor: Comment;
    private owner: Disposable | undefined = undefined;
    private instance: Instance | undefined = undefined;
    private text: Text | undefined = undefined;
    private node: ChildNode | undefined = undefined;
    private raw: ChildNode[] | undefined = undefined;
    private items: ChildPart[] | undefined = undefined;
    private controller: Controller | undefined = undefined;

    /** With `text`, the part starts with that empty text node before the anchor, which a text value fills. */
    constructor(anchor: Comment, text?: Text)
    {
        this.anchor = anchor;
        this.text = text;
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
        if (isSignal(value))
        {
            let adopt = cursor;
            this.owner = startEffect(() =>
            {
                const current = value.get();
                if (adopt !== undefined)
                {
                    const start = adopt;
                    adopt = undefined;
                    this.adopt(current, start);
                }
                else
                {
                    this.apply(current);
                }
            });
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

    /** Removes the displayed nodes. Effects are owned by `set()` and disposed there. */
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
                item.anchor.remove();
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
            this.text.remove();
            this.text = undefined;
        }
    }

    /** Removes the displayed nodes and the anchor itself. */
    destroy(): void
    {
        this.owner?.dispose();
        this.owner = undefined;
        this.clear();
        this.anchor.remove();
    }

    /** Takes over the server-rendered nodes from `cursor` to the anchor for `value`, repairing any disagreement. */
    private adopt(value: unknown, cursor: ChildNode): void
    {
        const { anchor } = this;
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
            this.controller = value.mount(this, cursor);
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
            this.clear();
            this.text = document.createTextNode(text);
            this.anchor.parentNode?.insertBefore(this.text, this.anchor);
            return;
        }
        if (value instanceof TemplateResult)
        {
            if (this.instance !== undefined && this.instance.strings === value.strings)
            {
                this.instance.update(value.values);
                return;
            }
            this.clear();
            const instance = Instance.create(value.strings, prepare(value.strings));
            instance.update(value.values);
            if (instance.content !== undefined)
            {
                this.anchor.parentNode?.insertBefore(instance.content, this.anchor);
            }
            this.instance = instance;
            return;
        }
        if (value instanceof Directive)
        {
            this.clear();
            this.controller = value.mount(this);
            return;
        }
        if (value instanceof RawHtml)
        {
            this.clear();
            const template = document.createElement("template");
            template.innerHTML = trusted(value.markup);
            const nodes = Array.from(template.content.childNodes);
            this.anchor.parentNode?.insertBefore(template.content, this.anchor);
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
            this.clear();
            this.anchor.parentNode?.insertBefore(value, this.anchor);
            this.node = value as ChildNode;
            return;
        }
        if (typeof value === "object" && Symbol.iterator in value)
        {
            this.clear();
            const items: ChildPart[] = [];
            for (const item of value as Iterable<unknown>)
            {
                const part = new ChildPart(anchorBefore(this.anchor));
                items.push(part);
                part.set(item);
            }
            this.items = items;
            return;
        }
        throw fail("unrenderable_value", { type: describe(value) });
    }
}

interface HandlerObject
{
    handleEvent(event: Event): void;
    capture?: boolean;
    passive?: boolean;
    once?: boolean;
}

/** An attribute, boolean attribute, property, or event binding on one element. */
class AttributePart implements BoundPart
{
    readonly count: number;
    private readonly element: Element;
    private readonly spec: PartSpec;
    private owner: Disposable | undefined = undefined;
    private listener: EventListenerOrEventListenerObject | undefined = undefined;
    private listenerOptions: AddEventListenerOptions | undefined = undefined;
    private target: unknown = undefined;

    constructor(element: Element, spec: PartSpec)
    {
        this.element = element;
        this.spec = spec;
        this.count = spec.count;
    }

    bind(values: readonly unknown[], offset: number): void
    {
        if (this.spec.kind === EVENT)
        {
            this.listen(values[offset]);
            return;
        }
        if (this.spec.kind === REF)
        {
            this.reference(values[offset]);
            return;
        }
        this.owner?.dispose();
        this.owner = undefined;
        if (this.count === 1)
        {
            const value = values[offset];
            if (isSignal(value))
            {
                this.owner = startEffect(() =>
                {
                    this.applyOne(value.get());
                });
                return;
            }
            this.applyOne(value);
            return;
        }
        const own = values.slice(offset, offset + this.count);
        if (own.some(isSignal))
        {
            this.owner = startEffect(() =>
            {
                this.apply(own.map((value) => (isSignal(value) ? value.get() : value)));
            });
        }
        else
        {
            this.apply(own);
        }
    }

    /** Applies the values of an attribute with several expressions. */
    private apply(values: readonly unknown[]): void
    {
        this.write(join(this.spec.strings, values));
    }

    /** Applies the value of a part with one expression. */
    private applyOne(value: unknown): void
    {
        const { element, spec } = this;
        if (spec.kind === BOOLEAN)
        {
            if (value)
            {
                element.setAttribute(spec.name, "");
            }
            else
            {
                element.removeAttribute(spec.name);
            }
            return;
        }
        if (spec.kind === ATTRIBUTE)
        {
            if (value === null || value === undefined)
            {
                element.removeAttribute(spec.name);
                return;
            }
            const before = spec.strings[0] ?? "";
            const after = spec.strings[1] ?? "";
            this.write(before === "" && after === "" ? String(value) : before + String(value) + after);
            return;
        }
        (element as unknown as Record<string, unknown>)[spec.name] = value;
    }

    /** Sets the attribute, or removes it and reports `unsafe_url_blocked` for a URL attribute with an unsafe scheme. */
    private write(text: string): void
    {
        const { element, spec } = this;
        if (URL_ATTRIBUTES.has(spec.name.toLowerCase()) && !safeUrl(text))
        {
            element.removeAttribute(spec.name);
            report(diagnostic("unsafe_url_blocked", "warning", { attribute: spec.name, value: text }));
            return;
        }
        element.setAttribute(spec.name, text);
    }

    /** Hands the element to a writable signal or a callback; the signal is reset when the element's template is removed. */
    private reference(target: unknown): void
    {
        if (target === this.target)
        {
            return;
        }
        this.target = target;
        this.owner?.dispose();
        const owner = createOwner();
        this.owner = owner;
        owner.run(() =>
        {
            const { element } = this;
            if (typeof target === "function")
            {
                (target as (element: Element) => void)(element);
                return;
            }
            if (isSignal(target) && typeof (target as Partial<Signal<unknown>>).set === "function")
            {
                const holder = target as Signal<Element | undefined>;
                holder.set(element);
                onDispose(() =>
                {
                    if (untracked(() => holder.get()) === element)
                    {
                        holder.set(undefined);
                    }
                });
                return;
            }
            throw fail("ref_not_assignable", { type: describe(target) });
        });
    }

    private listen(handler: unknown): void
    {
        if (this.listener !== undefined)
        {
            this.element.removeEventListener(this.spec.name, this.listener, this.listenerOptions);
            this.listener = undefined;
            this.listenerOptions = undefined;
        }
        if (handler === null || handler === undefined)
        {
            return;
        }
        if (typeof handler === "function")
        {
            this.listener = handler as EventListener;
        }
        else if (typeof handler === "object" && typeof (handler as HandlerObject).handleEvent === "function")
        {
            const object = handler as HandlerObject;
            this.listener = object;
            const options: AddEventListenerOptions = {};
            if (object.capture !== undefined)
            {
                options.capture = object.capture;
            }
            if (object.passive !== undefined)
            {
                options.passive = object.passive;
            }
            if (object.once !== undefined)
            {
                options.once = object.once;
            }
            this.listenerOptions = options;
        }
        else
        {
            throw fail("event_handler_not_function", { event: this.spec.name, type: describe(handler) });
        }
        this.element.addEventListener(this.spec.name, this.listener, this.listenerOptions);
    }
}

/** Where a view mounts: an element or fragment, or a CSS selector for one element in the document. */
export type MountTarget = Element | DocumentFragment | string;

/** The element behind a mount target; a selector that matches nothing is a `mount_target_missing` error. */
function resolveTarget(target: MountTarget): Element | DocumentFragment
{
    if (typeof target !== "string")
    {
        return target;
    }
    const element = document.querySelector(target);
    if (element === null)
    {
        throw fail("mount_target_missing", { selector: target });
    }
    return element;
}

/** Renders a view at the end of `target`, an element or a selector for one, and returns a handle to dispose it. */
export function render(view: unknown, target: MountTarget): Root
{
    const container = resolveTarget(target);
    const anchor = document.createComment("");
    container.append(anchor);
    const part = new ChildPart(anchor);
    const owner = createOwner();
    measure("Render", "render", () =>
    {
        owner.run(() =>
        {
            part.set(view);
        });
    });
    const root: Root = {
        container,
        dispose(): void
        {
            untrackRoot(root);
            owner.dispose();
            part.destroy();
        }
    };
    trackRoot(root, container, "render");
    return root;
}

/**
 * Attaches a view to markup the server rendered into `target`, an element
 * or a selector for one, with `renderToString`, reusing the nodes and
 * binding signals, listeners, properties, and refs. Any disagreement is
 * repaired on the client and returned in `mismatches`. Without
 * server-rendered markup it falls back to `render`.
 */
export function hydrate(view: unknown, target: MountTarget): HydrateResult
{
    const container = resolveTarget(target);
    const found: HydrationMismatch[] = [];
    let start: Comment | undefined;
    for (let node = container.firstChild; node !== null; node = node.nextSibling)
    {
        if (isStart(node))
        {
            start = node;
            break;
        }
    }
    const end = start === undefined ? undefined : matchingEnd(start);
    const owner = createOwner();
    let part: ChildPart;
    const previous = mismatches;
    mismatches = found;
    try
    {
        measure("Render", "hydrate", () =>
        {
            if (start === undefined || end === undefined)
            {
                mismatch("root", "server-rendered markup", "");
                const anchor = document.createComment("");
                container.append(anchor);
                part = new ChildPart(anchor);
                owner.run(() =>
                {
                    part.set(view);
                });
            }
            else
            {
                const cursor = start.nextSibling ?? end;
                part = new ChildPart(end);
                owner.run(() =>
                {
                    part.set(view, cursor);
                });
            }
        });
    }
    finally
    {
        mismatches = previous;
    }
    const result: HydrateResult = {
        container,
        mismatches: found,
        dispose(): void
        {
            untrackRoot(result);
            owner.dispose();
            part.destroy();
            start?.remove();
        }
    };
    trackRoot(result, container, "hydrate");
    return result;
}

/** Reads a signal or returns a plain value unchanged. */
function read<T>(value: ReadableSignal<T> | T): T
{
    return isSignal(value) ? (value.get() as T) : (value as T);
}

/** The key function for `each()`. */
export type KeyOf<T> = (item: T, index: number) => string | number | bigint | boolean | symbol | object;

/** The row renderer for `each()`. The item is a signal that updates in place; the index is a signal too, created only when the function declares a second parameter. */
export type RowOf<T> = (item: ReadableSignal<T>, index: ReadableSignal<number>) => unknown;

interface Row<T>
{
    readonly key: unknown;
    /** The row's first node, which the rows before it are inserted ahead of. */
    readonly start: ChildNode;
    /** A row that renders a template with no binding at its top level holds the template's own nodes, with no markers around them. */
    readonly nodes: readonly ChildNode[] | undefined;
    /** Any other row holds its view in a part between its start marker and the part's anchor. */
    readonly part: ChildPart | undefined;
    readonly item: Signal<T>;
    /** Undefined when the row function declares no index parameter. */
    readonly index: Signal<number> | undefined;
    readonly owner: Owner;
}

/** Removes a row's nodes; its owner is disposed by the caller. */
function removeRow(row: Row<unknown>): void
{
    if (row.nodes !== undefined)
    {
        for (const node of row.nodes)
        {
            node.remove();
        }
        return;
    }
    row.part?.destroy();
    row.start.remove();
}

/** Indices of one longest strictly increasing subsequence of `positions`, ignoring -1 entries. */
function longestIncreasing(positions: readonly number[]): Set<number>
{
    const tails: number[] = [];
    const previous = new Int32Array(positions.length).fill(-1);
    for (let i = 0; i < positions.length; i++)
    {
        const value = positions[i] ?? -1;
        if (value === -1)
        {
            continue;
        }
        let low = 0;
        let high = tails.length;
        while (low < high)
        {
            const middle = (low + high) >> 1;
            const index = tails[middle] ?? 0;
            if ((positions[index] ?? -1) < value)
            {
                low = middle + 1;
            }
            else
            {
                high = middle;
            }
        }
        previous[i] = low > 0 ? (tails[low - 1] ?? -1) : -1;
        tails[low] = i;
    }
    const kept = new Set<number>();
    let cursor = tails.length > 0 ? (tails[tails.length - 1] ?? -1) : -1;
    while (cursor !== -1)
    {
        kept.add(cursor);
        cursor = previous[cursor] ?? -1;
    }
    return kept;
}

/** The node right after a row's last node; the list's end marker follows every row, so there always is one. */
function nodeAfter(row: Row<unknown>): Node
{
    const last = row.nodes === undefined ? (row.part as ChildPart).anchor : (row.nodes[row.nodes.length - 1] as ChildNode);
    return last.nextSibling as Node;
}

function moveRow(row: Row<unknown>, before: Node): void
{
    const parent = before.parentNode;
    if (parent === null)
    {
        return;
    }
    if (row.nodes !== undefined)
    {
        for (const node of row.nodes)
        {
            parent.insertBefore(node, before);
        }
        return;
    }
    let node: ChildNode | null = row.start;
    const end = row.part?.anchor ?? null;
    while (node !== null && node !== end)
    {
        const next: ChildNode | null = node.nextSibling;
        parent.insertBefore(node, before);
        node = next;
    }
    if (end !== null)
    {
        parent.insertBefore(end, before);
    }
}

class Keyed<T> extends Directive
{
    readonly wrapsBranch: boolean = false;
    private readonly items: ReadableSignal<readonly T[]> | readonly T[];
    private readonly key: KeyOf<T>;
    private readonly row: RowOf<T>;

    constructor(items: ReadableSignal<readonly T[]> | readonly T[], key: KeyOf<T>, row: RowOf<T>)
    {
        super();
        this.items = items;
        this.key = key;
        this.row = row;
    }

    private keyOf(value: T, index: number, keys: Set<unknown>): unknown
    {
        const key = this.key(value, index);
        if (key === undefined)
        {
            throw fail("each_key_undefined", { index });
        }
        if (keys.has(key))
        {
            throw fail("each_key_duplicate", { key: String(key), index });
        }
        keys.add(key);
        return key;
    }

    override mount(part: ChildPart, cursor?: ChildNode): Controller
    {
        const owner = createOwner();
        const rows = new Map<unknown, Row<T>>();
        let order: Row<T>[] = [];
        const end = part.anchor;
        owner.run(() =>
        {
            onDispose(() =>
            {
                for (let i = order.length - 1; i >= 0; i--)
                {
                    (order[i] as Row<T>).owner.dispose();
                }
            });
        });

        /**
         * Creates a row in `parent` before `before`, which may be a fragment the
         * caller inserts later. A row whose view is a template with no binding
         * at its top level keeps the template's nodes; any other view, and a
         * row hydrated from markers, goes in a part between markers.
         */
        const create = (key: unknown, value: T, index: number, parent: Node, before: Node | null, adopt?: { start: Comment; end: Comment }): Row<T> =>
        {
            const item = signal(value);
            const position = this.row.length > 1 ? signal(index) : undefined;
            const rowOwner = createOwner(true);
            const row = rowOwner.run((): Row<T> =>
            {
                const view = this.row(item, position as ReadableSignal<number>);
                if (adopt === undefined && view instanceof TemplateResult)
                {
                    const prepared = prepare(view.strings);
                    if (prepared.content.firstChild !== null && !prepared.edges)
                    {
                        const instance = Instance.create(view.strings, prepared);
                        instance.update(view.values);
                        parent.insertBefore(instance.content as Node, before);
                        return { key, start: instance.nodes[0] as ChildNode, nodes: instance.nodes, part: undefined, item, index: position, owner: rowOwner };
                    }
                }
                const start = adopt?.start ?? parent.insertBefore(document.createComment(""), before);
                const rowPart = new ChildPart(adopt?.end ?? parent.insertBefore(document.createComment(""), before));
                rowPart.set(view, adopt === undefined ? undefined : adopt.start.nextSibling ?? adopt.end);
                return { key, start, nodes: undefined, part: rowPart, item, index: position, owner: rowOwner };
            });
            rows.set(key, row);
            return row;
        };

        /** Removes every current row at once when the list owns all of its parent's children, as a table body usually does. */
        const clearAll = (parent: ParentNode & Node): boolean =>
        {
            if (parent.firstChild !== order[0]?.start || parent.lastChild !== end)
            {
                return false;
            }
            for (let i = order.length - 1; i >= 0; i--)
            {
                (order[i] as Row<T>).owner.dispose();
            }
            parent.textContent = "";
            parent.appendChild(end);
            rows.clear();
            order = [];
            return true;
        };

        /** Whether the new items between `head` and `tail` are the old rows with only the first and last exchanged. */
        const swapped = (list: readonly T[], old: readonly Row<T>[], head: number, tail: number): boolean =>
        {
            if (this.key(list[head] as T, head) !== (old[tail - 1] as Row<T>).key || this.key(list[tail - 1] as T, tail - 1) !== (old[head] as Row<T>).key)
            {
                return false;
            }
            for (let i = head + 1; i < tail - 1; i++)
            {
                if (this.key(list[i] as T, i) !== (old[i] as Row<T>).key)
                {
                    return false;
                }
            }
            return true;
        };

        const reconcile = (list: readonly T[]): void =>
        {
            const parent = end.parentNode;
            if (parent === null)
            {
                return;
            }
            const old = order;
            if (list.length === 0)
            {
                if (old.length > 0 && !clearAll(parent))
                {
                    for (const row of old)
                    {
                        row.owner.dispose();
                        removeRow(row);
                    }
                    rows.clear();
                    order = [];
                }
                return;
            }
            const keys = new Set<unknown>();
            let head = 0;
            while (head < list.length && head < old.length)
            {
                const value = list[head] as T;
                const key = this.keyOf(value, head, keys);
                const row = old[head] as Row<T>;
                if (row.key !== key)
                {
                    keys.delete(key);
                    break;
                }
                row.item.set(value);
                head++;
            }
            let newTail = list.length;
            let oldTail = old.length;
            while (newTail > head && oldTail > head)
            {
                const value = list[newTail - 1] as T;
                const key = this.keyOf(value, newTail - 1, keys);
                const row = old[oldTail - 1] as Row<T>;
                if (row.key !== key)
                {
                    keys.delete(key);
                    break;
                }
                row.item.set(value);
                row.index?.set(newTail - 1);
                newTail--;
                oldTail--;
            }
            if (newTail - head > 1 && newTail === oldTail && swapped(list, old, head, newTail))
            {
                const first = old[head] as Row<T>;
                const last = old[newTail - 1] as Row<T>;
                for (let i = head + 1; i < newTail - 1; i++)
                {
                    (old[i] as Row<T>).item.set(list[i] as T);
                }
                first.item.set(list[newTail - 1] as T);
                first.index?.set(newTail - 1);
                last.item.set(list[head] as T);
                last.index?.set(head);
                const after = nodeAfter(last);
                moveRow(last, first.start);
                moveRow(first, after);
                const next = old.slice();
                next[head] = last;
                next[newTail - 1] = first;
                order = next;
                return;
            }
            if (head === oldTail)
            {
                const before = oldTail < old.length ? (old[oldTail] as Row<T>).start : end;
                const added = new Array<Row<T>>(newTail - head);
                for (let i = head; i < newTail; i++)
                {
                    const value = list[i] as T;
                    added[i - head] = create(this.keyOf(value, i, keys), value, i, parent, before);
                }
                order = old.length === 0 ? added : old.slice(0, head).concat(added, old.slice(oldTail));
                return;
            }
            const middle: Row<T>[] = [];
            const created = new Map<Row<T>, DocumentFragment>();
            let fragment: DocumentFragment | undefined;
            let survivors = head + old.length - oldTail;
            for (let i = head; i < newTail; i++)
            {
                const value = list[i] as T;
                const key = this.keyOf(value, i, keys);
                const existing = rows.get(key);
                if (existing !== undefined)
                {
                    existing.item.set(value);
                    existing.index?.set(i);
                    middle.push(existing);
                    survivors++;
                    fragment = undefined;
                }
                else
                {
                    fragment ??= document.createDocumentFragment();
                    const row = create(key, value, i, fragment, null);
                    created.set(row, fragment);
                    middle.push(row);
                }
            }
            if (survivors === 0 && clearAll(parent))
            {
                for (const row of middle)
                {
                    rows.set(row.key, row);
                }
                parent.insertBefore(fragment as DocumentFragment, end);
                order = middle;
                return;
            }
            else
            {
                for (let i = head; i < oldTail; i++)
                {
                    const row = old[i] as Row<T>;
                    if (!keys.has(row.key))
                    {
                        row.owner.dispose();
                        removeRow(row);
                        rows.delete(row.key);
                    }
                }
            }
            const previousIndex = new Map<Row<T>, number>();
            for (let i = head; i < oldTail; i++)
            {
                previousIndex.set(old[i] as Row<T>, i);
            }
            const kept = longestIncreasing(middle.map((row) => previousIndex.get(row) ?? -1));
            let before: Node = oldTail < old.length ? (old[oldTail] as Row<T>).start : end;
            for (let i = middle.length - 1; i >= 0; i--)
            {
                const row = middle[i] as Row<T>;
                const run = created.get(row);
                if (run !== undefined)
                {
                    if (run.firstChild !== null)
                    {
                        parent.insertBefore(run, before);
                    }
                }
                else if (!kept.has(i))
                {
                    moveRow(row, before);
                }
                before = row.start;
            }
            order = old.slice(0, head).concat(middle, old.slice(oldTail));
        };

        if (cursor !== undefined)
        {
            owner.run(() =>
            {
                const list = untracked(() => read(this.items));
                const keys = new Set<unknown>();
                let node: ChildNode = cursor;
                const adopted: Row<T>[] = [];
                for (let i = 0; i < list.length; i++)
                {
                    const value = list[i] as T;
                    const key = this.keyOf(value, i, keys);
                    const rowStart = isStart(node) ? node : undefined;
                    const rowEnd = rowStart === undefined ? undefined : matchingEnd(rowStart);
                    if (rowStart === undefined || rowEnd === undefined)
                    {
                        mismatch("missing", "row", node === end ? "" : node.nodeName);
                        adopted.push(create(key, value, i, end.parentNode as Node, end));
                        continue;
                    }
                    adopted.push(create(key, value, i, end.parentNode as Node, end, { start: rowStart, end: rowEnd }));
                    node = rowEnd.nextSibling ?? end;
                }
                if (node !== end)
                {
                    mismatch("extra", "", node.nodeName);
                    removeUntil(node, end);
                }
                order = adopted;
            });
        }

        let initial = cursor !== undefined;
        owner.run(() =>
        {
            startEffect(() =>
            {
                const list = read(this.items);
                if (initial)
                {
                    initial = false;
                    return;
                }
                owner.run(() =>
                {
                    reconcile(list);
                });
            });
        });

        return {
            dispose(): void
            {
                owner.dispose();
                for (const row of order)
                {
                    removeRow(row);
                }
                rows.clear();
                order = [];
            }
        };
    }

    override resolve(): unknown
    {
        const list = read(this.items);
        const keys = new Set<unknown>();
        return list.map((value, index) =>
        {
            this.keyOf(value, index, keys);
            return this.row(signal(value), signal(index));
        });
    }
}

/**
 * Renders one row per item, keyed, updating rows in place when their key
 * survives and moving the fewest nodes when the order changes. The row
 * function receives the item as a signal and, when it declares a second
 * parameter, the position as a signal.
 */
export function each<T>(items: ReadableSignal<readonly T[]> | readonly T[], key: KeyOf<T>, row: RowOf<T>): View
{
    return new Keyed(items, key, row);
}

class Conditional extends Directive
{
    readonly wrapsBranch: boolean = true;
    private readonly condition: unknown;
    private readonly whenTrue: () => unknown;
    private readonly whenFalse: (() => unknown) | undefined;

    constructor(condition: unknown, whenTrue: () => unknown, whenFalse: (() => unknown) | undefined)
    {
        super();
        this.condition = condition;
        this.whenTrue = whenTrue;
        this.whenFalse = whenFalse;
    }

    override mount(part: ChildPart, cursor?: ChildNode): Controller
    {
        const owner = createOwner();
        let inner: ChildPart;
        let shown: boolean | undefined;
        let branch: Owner | undefined;
        owner.run(() =>
        {
            onDispose(() => branch?.dispose());
        });
        const innerEnd = cursor !== undefined && isStart(cursor) ? matchingEnd(cursor) : undefined;
        if (cursor !== undefined && innerEnd !== undefined)
        {
            inner = new ChildPart(innerEnd);
            owner.run(() =>
            {
                shown = Boolean(untracked(() => read(this.condition)));
                branch = createOwner(true);
                branch.run(() =>
                {
                    inner.set(shown ? this.whenTrue() : this.whenFalse?.(), cursor.nextSibling ?? innerEnd);
                });
            });
            if (innerEnd.nextSibling !== part.anchor)
            {
                mismatch("extra", "", innerEnd.nextSibling?.nodeName ?? "");
                removeUntil(innerEnd.nextSibling as ChildNode, part.anchor);
            }
        }
        else
        {
            if (cursor !== undefined)
            {
                mismatch("missing", "branch", cursor === part.anchor ? "" : cursor.nodeName);
                removeUntil(cursor, part.anchor);
            }
            inner = new ChildPart(anchorBefore(part.anchor));
        }
        owner.run(() =>
        {
            startEffect(() =>
            {
                const next = Boolean(read(this.condition));
                if (next === shown)
                {
                    return;
                }
                shown = next;
                owner.run(() =>
                {
                    branch?.dispose();
                    branch = createOwner(true);
                    branch.run(() =>
                    {
                        inner.set(next ? this.whenTrue() : this.whenFalse?.());
                    });
                });
            });
        });
        return {
            dispose(): void
            {
                owner.dispose();
                inner.destroy();
            }
        };
    }

    override resolve(): unknown
    {
        return read(this.condition) ? this.whenTrue() : this.whenFalse?.();
    }
}

/** Renders `then()` while the condition is truthy and `otherwise()` while it is not. Branches are created lazily and disposed when hidden. */
export function when(condition: unknown, then: () => unknown, otherwise?: () => unknown): View
{
    return new Conditional(condition, then, otherwise);
}
