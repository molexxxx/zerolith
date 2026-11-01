/**
 * The types that make JSX a spelling of `html`. A `tsconfig`
 * with `"jsx": "react-jsx"` and `"jsxImportSource": "zerolith"` resolves
 * this module for element and attribute types; the lowering in
 * `@zerolith/vite` rewrites the JSX before any of it runs, so the
 * functions here only exist to say so if it did not.
 */
import type { View } from "./render.js";
import { fail } from "./diagnostics.js";

/** Attribute names an element accepts: plain attributes, and the `prop:`, `on:`, `bool:`, and `attr:` namespaces that select the other binding forms. */
export type ElementAttributes = {
    readonly [attribute: string]: unknown;
    readonly [property: `prop:${string}`]: unknown;
    readonly [event: `on:${string}`]: unknown;
    readonly [flag: `bool:${string}`]: unknown;
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
    /** Maps each intrinsic tag, a name such as `div` or `my-card`, to the attributes TypeScript checks on it: `ElementAttributes` for every tag. */
    type IntrinsicElements = { readonly [tag in keyof HTMLElementTagNameMap]: ElementAttributes } & { readonly [tag: string]: ElementAttributes };
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
