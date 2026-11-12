/**
 * Custom elements as the coexistence boundary: `define` registers an
 * element whose attributes and properties are signals and whose content is
 * a zerolith view, so a view can be mounted inside a page or a tree that
 * another framework owns. The content lives in light DOM, like every other
 * zerolith view, so scoped styles and design tokens apply unchanged.
 */
import { type Renderable, type Root, hasServerMarkup, hydrate, render } from "./render.js";
import { type ReadableSignal, type Signal, signal, untracked } from "./signals.js";

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

/**
 * The nodes from the first of `nodes` to the last as they stand now, which
 * takes in what another view inserted among them, such as a list's new rows,
 * or the nodes as given when the first and the last are no longer in order
 * under one parent.
 */
function standing(nodes: readonly Node[]): readonly Node[]
{
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (first === undefined || last === undefined || first.parentNode === null || first.parentNode !== last.parentNode)
    {
        return nodes;
    }
    const range: Node[] = [];
    for (let node: Node | null = first; node !== null; node = node.nextSibling)
    {
        range.push(node);
        if (node === last)
        {
            return range;
        }
    }
    return nodes;
}

/**
 * Registers a custom element for the view. Declared props are observed as
 * attributes and exposed as properties, both feeding the same signals, and
 * values assigned before the element was upgraded are kept. The content is
 * rendered when the element connects, and hydrated instead when the element
 * holds server-rendered markup, and disposed when the element disconnects.
 * What the tag holds is not shown on its own: it arrives as `children`, a
 * signal the view binds where it belongs, as a slot does, and it stays
 * through a move. A view that does not bind it shows none of it, so text in
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
    class ZerolithElement extends HTMLElement
    {
        static observedAttributes: readonly string[] = props;

        constructor()
        {
            super();
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
            if (hasServerMarkup(this))
            {
                roots.set(this, hydrate(view, this));
                return;
            }
            const children = props.includes("children") ? undefined : signals["children"];
            const held = [...this.childNodes];
            if (held.length > 0)
            {
                children?.set(held);
            }
            try
            {
                roots.set(this, render(view, this));
            }
            catch (error)
            {
                this.replaceChildren(...held);
                throw error;
            }
            for (const node of held)
            {
                if (node.parentNode === this)
                {
                    node.remove();
                }
            }
            if (document.readyState === "loading")
            {
                const end = this.lastChild as ChildNode;
                const loaded = (): void =>
                {
                    parsing.delete(this);
                    const added: Node[] = [];
                    let next = end.nextSibling;
                    while (next !== null)
                    {
                        added.push(next);
                        next.remove();
                        next = end.nextSibling;
                    }
                    if (added.length > 0)
                    {
                        children?.set([...children.get() as Node[], ...added]);
                    }
                };
                parsing.set(this, loaded);
                document.addEventListener("DOMContentLoaded", loaded, { once: true });
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
            const children = props.includes("children") ? undefined : store(this, props)["children"];
            const held = children === undefined ? undefined : standing(untracked(() => children.get()) as readonly Node[]);
            roots.get(this)?.dispose();
            roots.delete(this);
            if (held !== undefined)
            {
                children?.set(held);
            }
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
