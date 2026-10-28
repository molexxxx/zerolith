/**
 * Template preparation. The static strings of an `html` literal are scanned
 * once into markup with markers and a list of part specifications, then
 * parsed into a `<template>` through the Trusted Types policy. Parts are
 * located by their position in a tree walk, so binding a clone is a single
 * walk with no searching.
 */
import { fail } from "./diagnostics.js";

export const CHILD = 0;
export const ATTRIBUTE = 1;
export const BOOLEAN = 2;
export const PROPERTY = 3;
export const EVENT = 4;

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

export interface Scanned
{
    markup: string;
    parts: PartSpec[];
}

const TEXT = 0;
const TAG = 1;
const EQUALS = 2;
const DOUBLE = 3;
const SINGLE = 4;
const UNQUOTED = 5;
const COMMENT = 6;
const RAW = 7;

const MARK = "zl$";
const CHILD_MARKER = "<!--zl$-->";
const RAW_TAGS: ReadonlySet<string> = new Set(["style", "textarea", "title"]);
const UNSAFE_PROPERTIES: ReadonlySet<string> = new Set(["innerHTML", "outerHTML", "srcdoc"]);
const UNSAFE_ATTRIBUTES: ReadonlySet<string> = new Set(["srcdoc"]);

interface Bound
{
    name: string;
    strings: string[];
    start: number;
}

function isSpace(c: string): boolean
{
    return c === " " || c === "\n" || c === "\t" || c === "\r" || c === "\f";
}

function isNameStart(c: string): boolean
{
    return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

function attributeSpec(name: string, strings: string[]): PartSpec
{
    let kind = ATTRIBUTE;
    let actual = name;
    const prefix = name[0];
    if (prefix === ".")
    {
        kind = PROPERTY;
        actual = name.slice(1);
    }
    else if (prefix === "?")
    {
        kind = BOOLEAN;
        actual = name.slice(1);
    }
    else if (prefix === "@")
    {
        kind = EVENT;
        actual = name.slice(1);
    }
    if (kind !== ATTRIBUTE && (strings.length !== 2 || strings[0] !== "" || strings[1] !== ""))
    {
        throw fail("binding_not_single", { name });
    }
    if (kind === PROPERTY && UNSAFE_PROPERTIES.has(actual))
    {
        throw fail("unsafe_property_binding", { name: actual });
    }
    const lower = actual.toLowerCase();
    if (kind === ATTRIBUTE && (UNSAFE_ATTRIBUTES.has(lower) || lower.startsWith("on")))
    {
        throw fail("unsafe_attribute_binding", { name: actual });
    }
    return { kind, index: -1, name: actual, strings, count: strings.length - 1 };
}

/** Scans the static strings of a template literal. Pure; usable without a DOM. */
export function scan(strings: readonly string[]): Scanned
{
    const parts: PartSpec[] = [];
    let markup = "";
    let state = TEXT;
    let tag = "";
    let closing = false;
    let inTagName = false;
    let attr = "";
    let inAttrName = false;
    let attrStart = 0;
    let segment = 0;
    let bound: Bound | undefined;
    let raw = "";

    const finish = (end: number): void =>
    {
        if (bound === undefined)
        {
            return;
        }
        bound.strings.push(markup.slice(segment, end));
        const spec = attributeSpec(bound.name, bound.strings);
        markup = markup.slice(0, bound.start) + MARK + parts.length + markup.slice(end);
        parts.push(spec);
        bound = undefined;
    };

    const bind = (): void =>
    {
        if (bound === undefined)
        {
            bound = { name: attr, strings: [], start: attrStart };
        }
        bound.strings.push(markup.slice(segment));
        segment = markup.length;
    };

    for (let i = 0; i < strings.length; i++)
    {
        const s = strings[i] ?? "";
        for (let j = 0; j < s.length; j++)
        {
            const c = s[j] ?? "";
            const pos = markup.length;
            switch (state)
            {
                case TEXT:
                    if (c === "<")
                    {
                        const next = s[j + 1];
                        if (s.startsWith("!--", j + 1))
                        {
                            state = COMMENT;
                        }
                        else if (next !== undefined && (isNameStart(next) || next === "/"))
                        {
                            state = TAG;
                            tag = "";
                            inTagName = true;
                            closing = next === "/";
                        }
                    }
                    break;
                case COMMENT:
                    if (c === ">" && markup.endsWith("--"))
                    {
                        state = TEXT;
                    }
                    break;
                case RAW:
                    if (c === "<" && s.slice(j + 1, j + 2 + raw.length).toLowerCase() === "/" + raw)
                    {
                        state = TAG;
                        tag = "";
                        inTagName = true;
                        closing = true;
                    }
                    break;
                case TAG:
                    if (inTagName)
                    {
                        if (c === "/" && tag === "")
                        {
                            break;
                        }
                        if (isSpace(c) || c === ">" || c === "/")
                        {
                            inTagName = false;
                        }
                        else
                        {
                            tag += c.toLowerCase();
                            break;
                        }
                    }
                    if (inAttrName)
                    {
                        if (c === "=" || isSpace(c) || c === ">" || c === "/")
                        {
                            inAttrName = false;
                        }
                        else
                        {
                            attr += c;
                            break;
                        }
                    }
                    if (c === "=")
                    {
                        state = EQUALS;
                        break;
                    }
                    if (c === ">")
                    {
                        state = TEXT;
                        if (!closing)
                        {
                            if (tag === "script")
                            {
                                throw fail("script_in_template");
                            }
                            if (RAW_TAGS.has(tag))
                            {
                                state = RAW;
                                raw = tag;
                            }
                        }
                        break;
                    }
                    if (isSpace(c) || c === "/")
                    {
                        break;
                    }
                    inAttrName = true;
                    attr = c;
                    attrStart = pos;
                    break;
                case EQUALS:
                    if (isSpace(c))
                    {
                        break;
                    }
                    if (c === "\"")
                    {
                        state = DOUBLE;
                        segment = pos + 1;
                        break;
                    }
                    if (c === "'")
                    {
                        state = SINGLE;
                        segment = pos + 1;
                        break;
                    }
                    state = UNQUOTED;
                    segment = pos;
                    break;
                case DOUBLE:
                case SINGLE:
                    if (c === (state === DOUBLE ? "\"" : "'"))
                    {
                        const had = bound !== undefined;
                        finish(pos);
                        state = TAG;
                        if (had)
                        {
                            continue;
                        }
                    }
                    break;
                case UNQUOTED:
                    if (isSpace(c) || c === ">")
                    {
                        finish(pos);
                        state = TAG;
                        j--;
                        continue;
                    }
                    break;
                default:
                    break;
            }
            markup += c;
        }

        if (i < strings.length - 1)
        {
            switch (state)
            {
                case TEXT:
                    if (markup.endsWith("<"))
                    {
                        throw fail("binding_in_tag_position");
                    }
                    markup += CHILD_MARKER;
                    parts.push({ kind: CHILD, index: -1, name: "", strings: [], count: 1 });
                    break;
                case EQUALS:
                    state = UNQUOTED;
                    segment = markup.length;
                    bind();
                    break;
                case DOUBLE:
                case SINGLE:
                case UNQUOTED:
                    bind();
                    break;
                case COMMENT:
                    throw fail("binding_in_comment");
                case RAW:
                    throw fail("binding_in_raw_text", { tag: raw });
                default:
                    throw fail("binding_in_tag_position");
            }
        }
    }

    if (state !== TEXT)
    {
        throw fail("template_unclosed_tag");
    }
    return { markup, parts };
}

/** A parsed template and the parts to bind on each clone. */
export interface Prepared
{
    content: DocumentFragment;
    parts: readonly PartSpec[];
}

interface Policy
{
    createHTML(input: string): string;
}

interface PolicyFactory
{
    createPolicy(name: string, rules: { createHTML(input: string): string }): Policy;
}

let policy: Policy | undefined;

/** Passes template markup through the `zerolith` Trusted Types policy when the browser enforces one. */
function trusted(markup: string): string
{
    if (policy === undefined)
    {
        const factory = (globalThis as { trustedTypes?: PolicyFactory }).trustedTypes;
        policy = factory === undefined
            ? { createHTML: (input: string): string => input }
            : factory.createPolicy("zerolith", { createHTML: (input: string): string => input });
    }
    return policy.createHTML(markup);
}

const prepared: WeakMap<TemplateStringsArray, Prepared> = new WeakMap();

const SHOW: number = 1 | 128;

/** Walks elements and comments in document order, the order parts are listed in. */
export function walker(root: Node): TreeWalker
{
    return document.createTreeWalker(root, SHOW);
}

/** Parses a template literal's strings once and locates its parts. */
export function prepare(strings: TemplateStringsArray): Prepared
{
    const cached = prepared.get(strings);
    if (cached !== undefined)
    {
        return cached;
    }
    const { markup, parts } = scan(strings);
    const template = document.createElement("template");
    template.innerHTML = trusted(markup);
    const walk = walker(template.content);
    let index = 0;
    let child = 0;
    for (let node = walk.nextNode(); node !== null; node = walk.nextNode(), index++)
    {
        if (node.nodeType === 1)
        {
            const element = node as Element;
            const names: string[] = [];
            for (const attribute of element.attributes)
            {
                if (attribute.name.startsWith(MARK))
                {
                    names.push(attribute.name);
                }
            }
            for (const name of names)
            {
                const spec = parts[Number(name.slice(MARK.length))];
                if (spec !== undefined)
                {
                    spec.index = index;
                }
                element.removeAttribute(name);
            }
        }
        else if ((node as Comment).data === MARK)
        {
            while (child < parts.length && parts[child]?.kind !== CHILD)
            {
                child++;
            }
            const spec = parts[child];
            if (spec !== undefined)
            {
                spec.index = index;
            }
            child++;
        }
    }
    parts.sort((a, b) => a.index - b.index);
    const result: Prepared = { content: template.content, parts };
    prepared.set(strings, result);
    return result;
}
