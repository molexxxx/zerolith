/**
 * The part table of a template: what the scanner produces from the static
 * strings of an `html` literal, and what rendering, hydration, and server
 * rendering bind values into.
 */

export const CHILD = 0;
export const ATTRIBUTE = 1;
export const BOOLEAN = 2;
export const PROPERTY = 3;
export const EVENT = 4;
export const REF = 5;

/** The marker the scanner leaves where a part binds: an attribute named `zl$N`, or a comment for a child. */
export const MARK = "zl$";
export const CHILD_MARKER = "<!--zl$-->";

/** Where and how one or more expressions bind into the template. */
export interface PartSpec
{
    kind: number;
    /** Position of the bound node in a tree walk of the template content. */
    index: number;
    /** Attribute, property, or event name as written in the source. */
    name: string;
    /** Static text around the expressions of an attribute value; always one longer than `count`. */
    strings: readonly string[];
    /** Number of expressions the part consumes. */
    count: number;
}

/** The scanner's output: markup with markers, and the parts in source order. */
export interface Scanned
{
    markup: string;
    parts: PartSpec[];
}

/** A part as a build tool emits it: the kind, the name, and the static strings; `count` and `index` follow from them. */
export type PreparedPart = readonly [kind: number, name: string, strings: readonly string[]];
