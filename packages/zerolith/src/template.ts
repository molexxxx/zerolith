/**
 * Template preparation. The static strings of an `html` literal are scanned
 * once into markup with markers and a part table, by the scanner at run
 * time or by a build tool ahead of time, then parsed into a `<template>`
 * through the Trusted Types policy. Parts are located by their position in
 * a tree walk, so binding a clone is a single walk with no searching.
 */
import { CHILD, MARK, type PartSpec, type PreparedPart, type Scanned } from "./parts.js";
import { scan } from "./scan.js";

export { ATTRIBUTE, BOOLEAN, CHILD, EVENT, PROPERTY, REF } from "./parts.js";
export type { PartSpec, PreparedPart, Scanned } from "./parts.js";
export { scan } from "./scan.js";

/** A parsed template and the parts to bind on each clone. */
export interface Prepared
{
    content: DocumentFragment;
    parts: readonly PartSpec[];
    /** Whether a child part sits at the top level, where its content lands among the template's own nodes. */
    edges: boolean;
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
export function trusted(markup: string): string
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

const scans: WeakMap<readonly string[], Scanned> = new WeakMap();
const templates: WeakMap<readonly string[], Prepared> = new WeakMap();

/**
 * Registers the scan a build tool made of a template's strings, so the
 * runtime binds the template without scanning it, and returns the strings
 * for use as the tag's first argument:
 * `html(prepared(strings, markup, parts), ...values)`. The prepare pass in
 * `@zerolith/vite` emits these calls from what `scan` produced.
 */
export function prepared(strings: readonly string[], markup: string, parts: readonly PreparedPart[]): TemplateStringsArray
{
    scans.set(strings, {
        markup,
        parts: parts.map(([kind, name, pieces]) => ({ kind, index: -1, name, strings: pieces, count: kind === CHILD ? 1 : pieces.length - 1 }))
    });
    return strings as TemplateStringsArray;
}

/** The scan of a template's strings: the one registered ahead of time, or one made now and kept. */
export function scanned(strings: readonly string[]): Scanned
{
    let entry = scans.get(strings);
    if (entry === undefined)
    {
        entry = scan(strings);
        scans.set(strings, entry);
    }
    return entry;
}

const SHOW: number = 1 | 128;

/** Walks elements and comments in document order, the order parts are listed in. */
export function walker(root: Node): TreeWalker
{
    return document.createTreeWalker(root, SHOW);
}

/** Parses a template literal's strings once and locates its parts. */
export function prepare(strings: TemplateStringsArray): Prepared
{
    const cached = templates.get(strings);
    if (cached !== undefined)
    {
        return cached;
    }
    const entry = scanned(strings);
    const parts = entry.parts.map((spec) => ({ ...spec }));
    const template = document.createElement("template");
    template.innerHTML = trusted(entry.markup);
    const walk = walker(template.content);
    let index = 0;
    let child = 0;
    let edges = false;
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
            if (node.parentNode === template.content)
            {
                edges = true;
            }
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
    const result: Prepared = { content: template.content, parts, edges };
    templates.set(strings, result);
    return result;
}
