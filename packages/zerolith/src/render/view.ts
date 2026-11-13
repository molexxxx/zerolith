/**
 * The values the renderer accepts as a description of UI: the view brand,
 * the result of an `html` literal, raw markup, and the base of the
 * directives `each` and `when` build, with the predicates the server
 * renderer tells them apart by.
 */
import { type ReadableSignal, isSignal, recall, remember, restore } from "../signals.js";
import type { ChildPart } from "./instance.js";

/** Brand carried by every value the renderer accepts as a description of UI. */
export const VIEW: unique symbol = Symbol("zerolith.view");

/** Puts the view brand on a class's prototype, where every instance shares it without a property of its own; an exported class cannot declare the computed key itself under isolated declarations. */
function brand(viewClass: abstract new (...args: never[]) => View): void
{
    Object.defineProperty(viewClass.prototype, VIEW, { value: true });
}

/** A description of UI produced by `html`, `each`, or `when`, or by a component function. */
export interface View
{
    /** The brand, always `true`. The package does not export its symbol key, so a `View` comes only from `html`, `each`, `when`, or `unsafeHtml`, never from an object literal. */
    readonly [VIEW]: true;
}

/** What a view function returns and a content binding shows: a `View`, text, a number, a bigint, a boolean, `null`, `undefined`, a node, a signal of one of these, or an iterable of them. */
export type Renderable = View | string | number | bigint | boolean | null | undefined | Node | ReadableSignal<Renderable> | Iterable<Renderable>;

/** What a mounted directive returns, so the part it sits in can take it down. */
export interface Controller
{
    dispose(): void;
}

/** A part bound in a template instance: it consumes `count` values from the instance's value list. */
export interface BoundPart
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

/** The view an `html` literal produces: its strings, which identify the template, and its values. */
export class TemplateResult implements TemplateView
{
    readonly strings: TemplateStringsArray;
    readonly values: readonly unknown[];

    constructor(strings: TemplateStringsArray, values: readonly unknown[])
    {
        this.strings = strings;
        this.values = values;
        remember(this);
    }
}

/** The brand, shared through the prototype. */
export interface TemplateResult extends View {}
brand(TemplateResult);

/** A view that controls its own part. `resolve` gives the server renderer the view to draw for the current state. */
export abstract class Directive implements View
{
    constructor()
    {
        remember(this);
    }

    abstract mount(part: ChildPart, cursor?: ChildNode): Controller;
    /** The view to draw for the current state on the server; `render` renders a value to markup, for a directive that renders its view itself. */
    abstract resolve(render: (value: unknown) => string): unknown;
    /** True when the server wraps the resolved view in its own part markers (a branch), false when it renders rows directly. */
    abstract readonly wrapsBranch: boolean;
}

/** The brand, shared through the prototype. */
export interface Directive extends View {}
brand(Directive);

/** Markup that is inserted as is, as the server renderer sees it. */
export interface RawView extends View
{
    readonly markup: string;
}

/** The view `unsafeHtml` produces. */
export class RawHtml implements RawView
{
    readonly markup: string;

    constructor(markup: string)
    {
        this.markup = markup;
    }
}

/** The brand, shared through the prototype. */
export interface RawHtml extends View {}
brand(RawHtml);

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

/** The view a directive would show for the current state, for renderers without a DOM, which pass `render` to turn a value into markup. */
export function resolveDirective(view: View, render: (value: unknown) => string): unknown
{
    const provided = recall(view);
    try
    {
        return (view as Directive).resolve(render);
    }
    finally
    {
        restore(provided);
    }
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

/** Reads a signal or returns a plain value unchanged. */
export function read<T>(value: ReadableSignal<T> | T): T
{
    return isSignal(value) ? (value.get() as T) : (value as T);
}
