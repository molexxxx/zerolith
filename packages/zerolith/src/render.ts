/**
 * Rendering: template instantiation with fine-grained parts. A template is
 * cloned once and each expression binds to one node; a signal in a part
 * subscribes that part alone, so an update touches one text node or
 * attribute and the component function never runs again.
 */
import { URL_ATTRIBUTES, describe, isNothing, isText, join, safeUrl } from "./binding.js";
import { diagnostic, fail, report } from "./diagnostics.js";
import { type Owner, type ReadableSignal, type Signal, createOwner, effect, isSignal, onDispose, signal, untracked } from "./signals.js";
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
    /** Removes everything rendered and disposes every effect it created. */
    dispose(): void;
}

interface Controller
{
    dispose(): void;
}

interface BoundPart
{
    readonly count: number;
    bind(values: readonly unknown[]): void;
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
    abstract mount(part: ChildPart): Controller;
    abstract resolve(): unknown;
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

class Instance
{
    readonly strings: TemplateStringsArray;
    readonly fragment: DocumentFragment;
    readonly nodes: readonly ChildNode[];
    private readonly parts: readonly BoundPart[];

    constructor(strings: TemplateStringsArray, prepared: Prepared)
    {
        this.strings = strings;
        this.fragment = document.importNode(prepared.content, true);
        const walk = walker(this.fragment);
        const parts: BoundPart[] = [];
        let index = 0;
        let next = 0;
        let node = walk.nextNode();
        while (next < prepared.parts.length && node !== null)
        {
            const spec = prepared.parts[next];
            if (spec !== undefined && spec.index === index)
            {
                parts.push(spec.kind === CHILD ? new ChildPart(node as Comment) : new AttributePart(node as Element, spec));
                next++;
                continue;
            }
            node = walk.nextNode();
            index++;
        }
        this.parts = parts;
        this.nodes = Array.from(this.fragment.childNodes);
    }

    update(values: readonly unknown[]): void
    {
        let offset = 0;
        for (const part of this.parts)
        {
            part.bind(values.slice(offset, offset + part.count));
            offset += part.count;
        }
    }

    remove(): void
    {
        for (const node of this.nodes)
        {
            node.remove();
        }
    }
}

/** A position between two nodes that displays one value. */
class ChildPart implements BoundPart
{
    readonly count: number = 1;
    readonly anchor: Comment;
    private owner: Owner | undefined = undefined;
    private instance: Instance | undefined = undefined;
    private text: Text | undefined = undefined;
    private node: ChildNode | undefined = undefined;
    private raw: ChildNode[] | undefined = undefined;
    private items: ChildPart[] | undefined = undefined;
    private controller: Controller | undefined = undefined;

    constructor(anchor: Comment)
    {
        this.anchor = anchor;
    }

    bind(values: readonly unknown[]): void
    {
        this.set(values[0]);
    }

    /** Replaces the displayed value, disposing whatever the previous value created. */
    set(value: unknown): void
    {
        this.owner?.dispose();
        this.owner = createOwner();
        this.owner.run(() =>
        {
            if (isSignal(value))
            {
                effect(() =>
                {
                    this.apply(value.get());
                });
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
            const instance = new Instance(value.strings, prepare(value.strings));
            instance.update(value.values);
            this.anchor.parentNode?.insertBefore(instance.fragment, this.anchor);
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
            effect(() =>
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
    private owner: Owner | undefined = undefined;
    private listener: EventListenerOrEventListenerObject | undefined = undefined;
    private listenerOptions: AddEventListenerOptions | undefined = undefined;
    private target: unknown = undefined;

    constructor(element: Element, spec: PartSpec)
    {
        this.element = element;
        this.spec = spec;
        this.count = spec.count;
    }

    bind(values: readonly unknown[]): void
    {
        if (this.spec.kind === EVENT)
        {
            this.listen(values[0]);
            return;
        }
        if (this.spec.kind === REF)
        {
            this.reference(values[0]);
            return;
        }
        this.owner?.dispose();
        this.owner = createOwner();
        this.owner.run(() =>
        {
            if (values.some(isSignal))
            {
                effect(() =>
                {
                    this.apply(values.map((value) => (isSignal(value) ? value.get() : value)));
                });
            }
            else
            {
                this.apply(values);
            }
        });
    }

    private apply(values: readonly unknown[]): void
    {
        const { element, spec } = this;
        const value = values[0];
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
            if (spec.count === 1 && (value === null || value === undefined))
            {
                element.removeAttribute(spec.name);
                return;
            }
            const text = join(spec.strings, values);
            if (URL_ATTRIBUTES.has(spec.name.toLowerCase()) && !safeUrl(text))
            {
                element.removeAttribute(spec.name);
                report(diagnostic("unsafe_url_blocked", "warning", { attribute: spec.name, value: text }));
                return;
            }
            element.setAttribute(spec.name, text);
            return;
        }
        (element as unknown as Record<string, unknown>)[spec.name] = value;
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
        this.owner = createOwner();
        this.owner.run(() =>
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

/** Renders a view at the end of `container` and returns a handle to dispose it. */
export function render(view: unknown, container: Element | DocumentFragment): Root
{
    const anchor = document.createComment("");
    container.append(anchor);
    const part = new ChildPart(anchor);
    const owner = createOwner();
    owner.run(() =>
    {
        part.set(view);
    });
    return {
        dispose(): void
        {
            owner.dispose();
            part.destroy();
        }
    };
}

/** Reads a signal or returns a plain value unchanged. */
function read<T>(value: ReadableSignal<T> | T): T
{
    return isSignal(value) ? (value.get() as T) : (value as T);
}

/** The key function for `each()`. */
export type KeyOf<T> = (item: T, index: number) => string | number | bigint | boolean | symbol | object;

/** The row renderer for `each()`; the item and index are signals that update in place. */
export type RowOf<T> = (item: ReadableSignal<T>, index: ReadableSignal<number>) => unknown;

interface Row<T>
{
    readonly start: Comment;
    readonly part: ChildPart;
    readonly item: Signal<T>;
    readonly index: Signal<number>;
    readonly owner: Owner;
}

/** Indices of one longest strictly increasing subsequence of `positions`, ignoring -1 entries. */
function longestIncreasing(positions: readonly number[]): Set<number>
{
    const tails: number[] = [];
    const previous: number[] = Array.from({ length: positions.length }, () => -1);
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

function moveRow(row: Row<unknown>, before: Node): void
{
    const parent = before.parentNode;
    if (parent === null)
    {
        return;
    }
    let node: ChildNode | null = row.start;
    const end = row.part.anchor;
    while (node !== null && node !== end)
    {
        const next: ChildNode | null = node.nextSibling;
        parent.insertBefore(node, before);
        node = next;
    }
    parent.insertBefore(end, before);
}

class Keyed<T> extends Directive
{
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

    override mount(part: ChildPart): Controller
    {
        const owner = createOwner();
        const rows = new Map<unknown, Row<T>>();
        let order: Row<T>[] = [];
        const end = part.anchor;

        const create = (key: unknown, value: T, index: number): Row<T> =>
        {
            const start = anchorBefore(end);
            const rowPart = new ChildPart(anchorBefore(end));
            const row: Row<T> = { start, part: rowPart, item: signal(value), index: signal(index), owner: createOwner() };
            row.owner.run(() =>
            {
                rowPart.set(this.row(row.item, row.index));
            });
            rows.set(key, row);
            return row;
        };

        const reconcile = (list: readonly T[]): void =>
        {
            const next: Row<T>[] = [];
            const keys = new Set<unknown>();
            for (let i = 0; i < list.length; i++)
            {
                const value = list[i] as T;
                const key = this.key(value, i);
                if (key === undefined)
                {
                    throw fail("each_key_undefined", { index: i });
                }
                if (keys.has(key))
                {
                    throw fail("each_key_duplicate", { key: String(key), index: i });
                }
                keys.add(key);
                const existing = rows.get(key);
                if (existing !== undefined)
                {
                    existing.item.set(value);
                    existing.index.set(i);
                    next.push(existing);
                }
                else
                {
                    next.push(create(key, value, i));
                }
            }
            for (const [key, row] of rows)
            {
                if (!keys.has(key))
                {
                    row.owner.dispose();
                    row.part.destroy();
                    row.start.remove();
                    rows.delete(key);
                }
            }
            const previousIndex = new Map<Row<T>, number>();
            for (let i = 0; i < order.length; i++)
            {
                previousIndex.set(order[i] as Row<T>, i);
            }
            const positions = next.map((row) => previousIndex.get(row) ?? -1);
            const kept = longestIncreasing(positions);
            let before: Node = end;
            for (let i = next.length - 1; i >= 0; i--)
            {
                const row = next[i] as Row<T>;
                if (!kept.has(i))
                {
                    moveRow(row, before);
                }
                before = row.start;
            }
            order = next;
        };

        owner.run(() =>
        {
            effect(() =>
            {
                const list = read(this.items);
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
                    row.part.destroy();
                    row.start.remove();
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
            return this.row(signal(value), signal(index));
        });
    }
}

/**
 * Renders one row per item, keyed, updating rows in place when their key
 * survives and moving the fewest nodes when the order changes.
 */
export function each<T>(items: ReadableSignal<readonly T[]> | readonly T[], key: KeyOf<T>, row: RowOf<T>): View
{
    return new Keyed(items, key, row);
}

class Conditional extends Directive
{
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

    override mount(part: ChildPart): Controller
    {
        const owner = createOwner();
        const inner = new ChildPart(anchorBefore(part.anchor));
        let shown: boolean | undefined;
        let branch: Owner | undefined;
        owner.run(() =>
        {
            effect(() =>
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
                    branch = createOwner();
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
