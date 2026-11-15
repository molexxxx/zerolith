/**
 * Custom elements as the coexistence boundary: `define` registers an
 * element whose attributes and properties are signals and whose content is
 * a zerolith view, so a view can be mounted inside a page or a tree that
 * another framework owns. The content lives in light DOM, like every other
 * zerolith view, so scoped styles and design tokens apply unchanged.
 */
import { type Renderable, type Root, hasServerMarkup, hydrate, render, slotOf, watchSlot } from "./render.js";
import { type ReadableSignal, type Signal, recall, remember, restore, signal, untracked } from "./signals.js";

/** The signals an element's view receives: one per declared prop, and `children`, what the tag held, unless a prop takes that name. */
export type ElementProps<Props extends readonly string[]> = { readonly [K in Props[number]]: ReadableSignal<unknown> } & { readonly children: ReadableSignal<readonly Node[]> };

/** Options for `define`. */
export interface ElementOptions<Props extends readonly string[]>
{
    /** The attribute and property names the element exposes. An attribute arrives as a string or undefined; a property keeps its value. */
    props: Props;
    /** Renders the element's content from the prop signals, and from `children`, what the tag held, which it binds where it belongs; `host` is the element, for events and measurements. */
    view: (props: ElementProps<Props>, host: HTMLElement) => Renderable;
}

const stores: WeakMap<HTMLElement, Record<string, Signal<unknown>>> = new WeakMap();

function store(host: HTMLElement, props: readonly string[]): Record<string, Signal<unknown>>
{
    let signals = stores.get(host);
    if (signals === undefined)
    {
        signals = { children: signal<unknown>([]) };
        for (const name of props)
        {
            signals[name] = signal<unknown>(undefined);
        }
        stores.set(host, signals);
    }
    return signals;
}

/** Takes out of `host` those of `nodes` that are still its children. */
function release(host: Node, nodes: readonly Node[]): void
{
    for (const node of nodes)
    {
        if (node.parentNode === host)
        {
            (node as ChildNode).remove();
        }
    }
}

/** Whether `node` is no longer laid out by `host`'s view: it is out of `host`, as a part of the view that is not shown is, or an element between them took it as one of its own children, as the element a view forwards `children` to takes the comments of the part that renders them. */
function apart(node: Node, host: Node): boolean
{
    let at = node.parentNode;
    while (at !== null && at !== host)
    {
        const held = stores.get(at as HTMLElement)?.["children"];
        const inner: unknown = held === undefined ? undefined : untracked(() => held.get());
        if (Array.isArray(inner) && inner.includes(node))
        {
            return true;
        }
        at = at.parentNode;
    }
    return at === null;
}

/**
 * `nodes` as they stand now in the part of `host`'s view that renders them
 * whole, as `${children}` does: what lies between the part's opening and
 * closing comments, less the comment after each item. That leaves out a
 * node taken out of the page since, as a list takes out a row, takes in
 * what another view inserted among them, such as a list's new rows, and
 * keeps the order they are in. The nodes as given when no part renders
 * them whole, as in a view that shows some of them or binds them in several
 * places; when one of them sits anywhere else, where the view or a script
 * still shows it; when the view forwards them to another element, which
 * then lays out what lies between the comments; when the part is in a piece
 * of the view that is not shown; or when the part has rendered again since,
 * so its opening comment no longer leads to its closing one.
 */
function standing(nodes: readonly Node[], host: Node): readonly Node[]
{
    const slot = slotOf(nodes);
    if (slot === undefined || apart(slot.start, host))
    {
        return nodes;
    }
    const own: Set<Node> = new Set();
    for (const item of slot.items)
    {
        if (item.anchor !== null)
        {
            own.add(item.anchor);
        }
    }
    const range: Set<Node> = new Set();
    let node = slot.start.nextSibling;
    while (node !== null && node !== slot.end)
    {
        if (!own.has(node))
        {
            range.add(node);
        }
        node = node.nextSibling;
    }
    return node === null || nodes.some((given) => given.parentNode !== null && !range.has(given)) ? nodes : [...range];
}

/**
 * Registers a custom element for the view. Declared props are observed as
 * attributes and exposed as properties, both feeding the same signals, and
 * values assigned before the element was upgraded are kept. The content is
 * rendered when the element connects, and hydrated instead when the element
 * holds server-rendered markup, and disposed when the element disconnects.
 * What the tag holds is not shown on its own: it arrives as `children`, a
 * signal the view binds where it belongs, as a slot does, and it stays
 * through a move, following the rows a list in the tag adds or removes
 * where the view binds it whole. A view that does not bind it shows none
 * of it, so text in
 * the tag serves as a fallback until the script loads, and a view that throws,
 * or returns content that fails to render, leaves it in place. A view inside
 * another component's shadow root gets the scoped styles there too.
 * The view runs inside the root's owner, so the effects and `onDispose`
 * cleanups it registers end when the element disconnects. Without a
 * `customElements` registry, as on the server, nothing is registered.
 * Defining a name twice is a no-op, so modules can re-run under hot
 * replacement.
 */
export function define<const Props extends readonly string[]>(name: string, options: ElementOptions<Props>): void
{
    if (typeof customElements === "undefined" || customElements.get(name) !== undefined)
    {
        return;
    }
    const props = options.props;
    const roots: WeakMap<HTMLElement, Root> = new WeakMap();
    const parsing: WeakMap<HTMLElement, () => void> = new WeakMap();
    /** Renders the view in `host` in place of what the tag holds, which arrives as `children`, and puts that back when rendering fails. A function rather than a method, which a prop named `show` would replace. */
    const show = (host: HTMLElement, view: () => Renderable): void =>
    {
        const children = props.includes("children") ? undefined : store(host, props)["children"];
        const held = [...host.childNodes];
        if (held.length > 0)
        {
            children?.set(held);
        }
        const given = children === undefined ? undefined : untracked(() => children.get()) as readonly Node[];
        if (given !== undefined && given.length > 0)
        {
            watchSlot(given);
        }
        try
        {
            roots.set(host, render(held.length === 0 ? view : () =>
            {
                const content = view();
                release(host, held);
                return content;
            }, host));
        }
        catch (error)
        {
            host.replaceChildren(...held);
            throw error;
        }
        if (document.readyState === "loading")
        {
            const end = host.lastChild as ChildNode;
            const loaded = (): void =>
            {
                parsing.delete(host);
                const added: Node[] = [];
                let next = end.nextSibling;
                while (next !== null)
                {
                    added.push(next);
                    next.remove();
                    next = end.nextSibling;
                }
                if (added.length > 0 && children !== undefined)
                {
                    const all = [...standing(children.get() as readonly Node[], host), ...added];
                    watchSlot(all);
                    children.set(all);
                }
            };
            parsing.set(host, loaded);
            document.addEventListener("DOMContentLoaded", loaded, { once: true });
        }
    };

    class ZerolithElement extends HTMLElement
    {
        static observedAttributes: readonly string[] = props;

        constructor()
        {
            super();
            remember(this);
            const signals = store(this, props);
            for (const prop of props)
            {
                if (Object.hasOwn(this, prop))
                {
                    const value = (this as unknown as Record<string, unknown>)[prop];
                    delete (this as unknown as Record<string, unknown>)[prop];
                    signals[prop]?.set(value);
                }
            }
        }

        attributeChangedCallback(attribute: string, _previous: string | null, value: string | null): void
        {
            store(this, props)[attribute]?.set(value === null ? undefined : value);
        }

        connectedCallback(): void
        {
            if (roots.has(this))
            {
                return;
            }
            const signals = store(this, props);
            const view = (): Renderable => options.view(signals as unknown as ElementProps<Props>, this);
            const provided = recall(this);
            try
            {
                if (hasServerMarkup(this))
                {
                    roots.set(this, hydrate(view, this));
                    return;
                }
                show(this, view);
            }
            finally
            {
                restore(provided);
            }
        }

        disconnectedCallback(): void
        {
            const loaded = parsing.get(this);
            if (loaded !== undefined)
            {
                parsing.delete(this);
                document.removeEventListener("DOMContentLoaded", loaded);
            }
            const root = roots.get(this);
            if (root === undefined)
            {
                return;
            }
            roots.delete(this);
            const children = props.includes("children") ? undefined : store(this, props)["children"];
            if (children === undefined)
            {
                root.dispose();
                return;
            }
            const held = standing(untracked(() => children.get()) as readonly Node[], this);
            root.dispose();
            release(this, held);
            children.set(held);
        }
    }
    for (const prop of props)
    {
        Object.defineProperty(ZerolithElement.prototype, prop, {
            configurable: true,
            enumerable: true,
            get(this: HTMLElement): unknown
            {
                return store(this, props)[prop]?.get();
            },
            set(this: HTMLElement, value: unknown): void
            {
                store(this, props)[prop]?.set(value);
            }
        });
    }
    customElements.define(name, ZerolithElement);
}
