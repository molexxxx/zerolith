/**
 * Custom elements as the coexistence boundary: `define` registers an
 * element whose attributes and properties are signals and whose content is
 * a zerolith view, so a view can be mounted inside a page or a tree that
 * another framework owns. The content lives in light DOM, like every other
 * zerolith view, so scoped styles and design tokens apply unchanged.
 */
import { type HydrateResult, hydrate } from "./render.js";
import { type ReadableSignal, type Signal, signal } from "./signals.js";

/** The signals an element's view receives, one per declared prop. */
export type ElementProps<Props extends readonly string[]> = { readonly [K in Props[number]]: ReadableSignal<unknown> };

/** Options for `define`. */
export interface ElementOptions<Props extends readonly string[]>
{
    /** The attribute and property names the element exposes. An attribute arrives as a string or undefined; a property keeps its value. */
    props: Props;
    /** Renders the element's content from the prop signals; `host` is the element, for events and measurements. */
    view: (props: ElementProps<Props>, host: HTMLElement) => unknown;
}

const stores: WeakMap<HTMLElement, Record<string, Signal<unknown>>> = new WeakMap();

function store(host: HTMLElement, props: readonly string[]): Record<string, Signal<unknown>>
{
    let signals = stores.get(host);
    if (signals === undefined)
    {
        signals = {};
        for (const name of props)
        {
            signals[name] = signal<unknown>(undefined);
        }
        stores.set(host, signals);
    }
    return signals;
}

/**
 * Registers a custom element for the view. Declared props are observed as
 * attributes and exposed as properties, both feeding the same signals, and
 * values assigned before the element was upgraded are kept. The content is
 * rendered when the element connects, hydrated when it already holds
 * server-rendered markup, and disposed when it disconnects. Without a
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
    const roots: WeakMap<HTMLElement, HydrateResult> = new WeakMap();
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
            roots.set(this, hydrate(options.view(store(this, props) as unknown as ElementProps<Props>, this), this));
        }

        disconnectedCallback(): void
        {
            roots.get(this)?.dispose();
            roots.delete(this);
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
