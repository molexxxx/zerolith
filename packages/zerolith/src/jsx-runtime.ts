/**
 * The types that make JSX a spelling of `html`. A `tsconfig`
 * with `"jsx": "react-jsx"` and `"jsxImportSource": "zerolith"` resolves
 * this module for element and attribute types; the lowering in
 * `@zerolith/vite` rewrites the JSX before any of it runs, so the
 * functions here only exist to say so if it did not.
 */
import type { View } from "./render.js";
import type { ReadableSignal } from "./signals.js";
import { fail } from "./diagnostics.js";

/** A value a binding takes as it is, or a signal of one, which binds live. */
export type Bindable<T> = T | ReadableSignal<T>;

/** What a `ref` hands the element to: a callback, or a writable signal, which goes back to `undefined` when the element's template is removed. */
export type Ref<E> = ((element: E) => void) | { set(value: E | undefined): void; get(): Element | undefined };

/** What an `on:` attribute takes: a function of the event, whose `currentTarget` is the element, an object with `handleEvent` and the listener options the runtime reads, or nothing. */
export type EventHandler<Ev extends Event, E> =
    | ((event: Ev & { readonly currentTarget: E }) => void)
    | { handleEvent(event: Ev & { readonly currentTarget: E }): void; capture?: boolean; passive?: boolean; once?: boolean }
    | null
    | undefined;

/** The `prop:` attributes of an element: each property the element's type declares, taking that property's type or a signal of it; a property the type does not declare takes any value. */
export type PropertyAttributes<E> = { readonly [K in Extract<keyof E, string> as `prop:${K}`]?: Bindable<E[K]> };

/** The `on:` attributes of an element: each event the DOM declares, taking a handler of that event. An event the DOM does not declare, such as a custom element's own, takes any handler. */
export type EventAttributes<E> = { readonly [K in keyof HTMLElementEventMap as `on:${K}`]?: EventHandler<HTMLElementEventMap[K], E> };

/** The `bool:` attributes: a boolean, or a signal of one, which sets or removes the attribute. */
export type BooleanAttributes = { readonly [flag: `bool:${string}`]: Bindable<boolean | null | undefined> };

/**
 * Attribute names an element accepts: plain attributes, which take any value and write it as text, and the `prop:`, `on:`, and `bool:` namespaces that select the other binding forms, typed from the element `E`.
 */
export type ElementAttributes<E = HTMLElement> = {
    readonly [attribute: string]: unknown;
    readonly children?: unknown;
    readonly ref?: Ref<E>;
} & PropertyAttributes<E> & EventAttributes<E> & BooleanAttributes;

/** Each HTML tag with the attributes of its element type. */
export type KnownElements = { readonly [tag in keyof HTMLElementTagNameMap]: ElementAttributes<HTMLElementTagNameMap[tag]> };

/** The attributes of an element TypeScript does not know, such as a custom element's: any attribute, property, handler, and flag. */
export type AnyElementAttributes = {
    readonly [attribute: string]: unknown;
    readonly children?: unknown;
    readonly ref?: unknown;
};

/** The JSX namespace TypeScript reads. */
export declare namespace JSX
{
    /** The type TypeScript gives every JSX expression and checks a function component's return type against: a `View`, which the lowered `html` call returns. */
    type Element = View;
    /** Names the prop that carries children; TypeScript reads only the property's name, `children`, and checks the content between an element's tags against that prop. */
    interface ElementChildrenAttribute
    {
        children: unknown;
    }
    /** Props TypeScript accepts on every component element on top of the component's own: `ref`, which the lowering passes to the component as an ordinary prop. */
    interface IntrinsicAttributes
    {
        ref?: unknown;
    }
    /** Maps each intrinsic tag to the attributes TypeScript checks on it: a name the DOM declares, such as `input`, gets its element's properties and events; any other, such as a custom element's, takes any attribute, property, and handler. */
    interface IntrinsicElements extends KnownElements
    {
        readonly [tag: string]: AnyElementAttributes;
    }
}

/** Fragments lower to a template with no root element; the marker exists only for the types. */
export const Fragment: unique symbol = Symbol("zerolith.fragment");

/** Reached only when JSX was not lowered; throws a diagnostic. */
export function jsx(): never
{
    throw fail("jsx_not_lowered", {});
}

/** The same as `jsx`. */
export const jsxs: typeof jsx = jsx;

/** The same as `jsx`. */
export const jsxDEV: typeof jsx = jsx;
