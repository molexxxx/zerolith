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
    /**
     * The child indexes from `content` down to each part's node, in the order
     * of `parts`, one array shared by the parts of an element. A template
     * with a part whose node was not found, such as one inside a nested
     * `<template>` element, binds no parts.
     */
    paths: readonly (readonly number[])[];
    /** Whether a child part sits at the top level, where its content lands among the template's own nodes. */
    edges: boolean;
    /**
     * A copy of `content` owned by the page's document, which instances clone:
     * the one top-level node, or a fragment holding several. Undefined when
     * the template holds a custom element or an element that fetches, whose
     * copy would construct or load once more, so instances import `content`.
     */
    master: Node | undefined;
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

/** Elements that construct something or start a request as soon as the page's document owns them. */
const EAGER: ReadonlySet<string> = new Set(["audio", "embed", "iframe", "image", "img", "input", "link", "object", "picture", "script", "source", "track", "use", "video"]);

/** Whether copying `content` into the page's document once has no effect beyond the copy. */
function inert(content: DocumentFragment): boolean
{
    const walk = document.createTreeWalker(content, 1);
    for (let node = walk.nextNode(); node !== null; node = walk.nextNode())
    {
        const element = node as Element;
        if (element.localName.includes("-") || element.hasAttribute("is") || EAGER.has(element.localName))
        {
            return false;
        }
    }
    return true;
}

/** Walks elements and comments in document order, the order parts are listed in. */
export function walker(root: Node): TreeWalker
{
    return document.createTreeWalker(root, SHOW);
}

/**
 * The child indexes from `root` down to each part's node, one array shared
 * by the parts of a node, or undefined when a part has no node.
 */
function pathsOf(parts: readonly PartSpec[], targets: ReadonlyMap<PartSpec, Node>, root: Node): number[][] | undefined
{
    const shared = new Map<Node, number[]>();
    const paths: number[][] = [];
    for (const spec of parts)
    {
        const target = targets.get(spec);
        if (target === undefined)
        {
            return undefined;
        }
        let path = shared.get(target);
        if (path === undefined)
        {
            path = [];
            for (let node: Node = target; node !== root; node = node.parentNode as Node)
            {
                let position = 0;
                for (let sibling = node.previousSibling; sibling !== null; sibling = sibling.previousSibling)
                {
                    position++;
                }
                path.push(position);
            }
            path.reverse();
            shared.set(target, path);
        }
        paths.push(path);
    }
    return paths;
}

/**
 * Parses a template literal's strings once and locates its parts. Each
 * child part's marker gets an empty text node before it, which the part
 * fills when its value is text instead of creating and inserting one.
 */
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
    const targets = new Map<PartSpec, Node>();
    const markers: Node[] = [];
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
                    targets.set(spec, element);
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
            markers.push(node);
            while (child < parts.length && parts[child]?.kind !== CHILD)
            {
                child++;
            }
            const spec = parts[child];
            if (spec !== undefined)
            {
                spec.index = index;
                targets.set(spec, node);
            }
            child++;
        }
    }
    for (const marker of markers)
    {
        marker.parentNode?.insertBefore(document.createTextNode(""), marker);
    }
    parts.sort((a, b) => a.index - b.index);
    const paths = pathsOf(parts, targets, template.content);
    let master: Node | undefined;
    if (paths !== undefined && inert(template.content))
    {
        const copy = document.importNode(template.content, true);
        master = copy.firstChild !== null && copy.firstChild.nextSibling === null ? copy.firstChild : copy;
    }
    const result: Prepared = paths === undefined ? { content: template.content, parts: [], paths: [], edges, master } : { content: template.content, parts, paths, edges, master };
    templates.set(strings, result);
    return result;
}
