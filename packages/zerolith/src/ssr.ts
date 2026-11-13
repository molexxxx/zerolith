/**
 * The server renderer: turns a view into an HTML string with no DOM. It
 * works from the same scan of the template strings the browser uses, so
 * markup, escaping, and URL rules cannot differ between the two. Signals
 * are read once; `each` and `when` render their current state; property,
 * event, and ref bindings are client-only and render nothing.
 *
 * Every child part's content is wrapped in comment markers so `hydrate()`
 * can bind the same view to the rendered nodes.
 */
import { URL_ATTRIBUTES, describe, isNothing, isText, join, safeUrl } from "./binding.js";
import { styleSheets } from "./css.js";
import { diagnostic, fail, report } from "./diagnostics.js";
import { PART_END, PART_START, type Renderable, type TemplateView, directiveWrapsBranch, isDirective, isRawHtml, isTemplate, produce, resolveDirective } from "./render.js";
import { isSignal, scope } from "./signals.js";
import { ATTRIBUTE, BOOLEAN, CHILD, type PartSpec, scanned } from "./template.js";

/** A marker the scanner wrote into the markup: a comment for a child part, or an attribute name `zl$<n>` for the attribute part `n`, with where it starts and ends. */
interface Marker
{
    start: number;
    end: number;
    index?: number;
}

/**
 * The markers of a scanned template's markup, in order, read as the scanner
 * placed them: a child marker is a comment in text, and an attribute marker
 * is an attribute name inside a start tag, outside any quoted value. Text
 * or a quoted value that happens to read `zl$0` is left alone, as the
 * browser leaves it when the client parses the same markup.
 */
function markers(markup: string): Marker[]
{
    const found: Marker[] = [];
    let i = 0;
    let inTag = false;
    let quote = "";
    while (i < markup.length)
    {
        const c = markup[i] ?? "";
        if (quote !== "")
        {
            if (c === quote)
            {
                quote = "";
            }
            i++;
            continue;
        }
        if (inTag)
        {
            if (c === "\"" || c === "'")
            {
                quote = c;
                i++;
                continue;
            }
            if (c === ">")
            {
                inTag = false;
                i++;
                continue;
            }
            if (markup.startsWith("zl$", i) && (i === 0 || /\s/.test(markup[i - 1] ?? "")))
            {
                let end = i + 3;
                while (end < markup.length && (markup[end] ?? "") >= "0" && (markup[end] ?? "") <= "9")
                {
                    end++;
                }
                if (end > i + 3)
                {
                    found.push({ start: i, end, index: Number(markup.slice(i + 3, end)) });
                    i = end;
                    continue;
                }
            }
            i++;
            continue;
        }
        if (markup.startsWith("<!--zl$-->", i))
        {
            found.push({ start: i, end: i + 10 });
            i += 10;
            continue;
        }
        if (markup.startsWith("<!--", i))
        {
            const close = markup.indexOf("-->", i + 4);
            i = close === -1 ? markup.length : close + 3;
            continue;
        }
        if (c === "<" && /[A-Za-z/]/.test(markup[i + 1] ?? ""))
        {
            inTag = true;
        }
        i++;
    }
    return found;
}

/** Escapes text content. */
export function escapeText(text: string): string
{
    return text.replace(/[&<>]/g, (character) => (character === "&" ? "&amp;" : character === "<" ? "&lt;" : "&gt;"));
}

/** Escapes an attribute value for double quotes. */
export function escapeAttribute(text: string): string
{
    return text.replace(/[&"<>]/g, (character) => (character === "&" ? "&amp;" : character === "\"" ? "&quot;" : character === "<" ? "&lt;" : "&gt;"));
}

function read(value: unknown): unknown
{
    return isSignal(value) ? value.get() : value;
}

/** Wraps a child part's rendered content in the markers hydration looks for. */
function part(content: string): string
{
    return `<!--${PART_START}-->${content}<!--${PART_END}-->`;
}

function renderAttribute(spec: PartSpec, values: readonly unknown[]): string
{
    const resolved = values.map(read);
    const value = resolved[0];
    if (spec.kind === BOOLEAN)
    {
        return value ? ` ${spec.name}=""` : "";
    }
    if (spec.kind === ATTRIBUTE)
    {
        if (spec.count === 1 && (value === null || value === undefined))
        {
            return "";
        }
        const text = join(spec.strings, resolved);
        if (URL_ATTRIBUTES.has(spec.name.toLowerCase()) && !safeUrl(text))
        {
            report(diagnostic("unsafe_url_blocked", "warning", { attribute: spec.name, value: text }));
            return "";
        }
        return ` ${spec.name}="${escapeAttribute(text)}"`;
    }
    return "";
}

/** Renders a value without its own markers; the caller decides whether it is a part. */
function renderValue(value: unknown): string
{
    const resolved = read(value);
    if (isNothing(resolved))
    {
        return "";
    }
    if (isText(resolved))
    {
        return escapeText(String(resolved));
    }
    if (isTemplate(resolved))
    {
        return renderTemplate(resolved);
    }
    if (isDirective(resolved))
    {
        const inner = renderValue(resolveDirective(resolved, renderValue));
        return directiveWrapsBranch(resolved) ? part(inner) : inner;
    }
    if (isRawHtml(resolved))
    {
        return resolved.markup;
    }
    if (isSignal(resolved))
    {
        return renderValue(resolved);
    }
    if (typeof resolved === "object" && Symbol.iterator in resolved)
    {
        let out = "";
        for (const item of resolved as Iterable<unknown>)
        {
            out += part(renderValue(item));
        }
        return out;
    }
    throw fail("unrenderable_value", { type: describe(resolved) });
}

function renderTemplate(view: TemplateView): string
{
    const { markup, parts } = scanned(view.strings);
    const slots: Array<{ spec: PartSpec; values: readonly unknown[] }> = [];
    let offset = 0;
    for (const spec of parts)
    {
        slots.push({ spec, values: view.values.slice(offset, offset + spec.count) });
        offset += spec.count;
    }
    let child = 0;
    let out = "";
    let last = 0;
    for (const marker of markers(markup))
    {
        const before = markup.slice(last, marker.start);
        last = marker.end;
        const index = marker.index;
        if (index !== undefined)
        {
            const slot = slots[index];
            out += before.trimEnd() + (slot === undefined ? "" : renderAttribute(slot.spec, slot.values));
            continue;
        }
        while (child < slots.length && slots[child]?.spec.kind !== CHILD)
        {
            child++;
        }
        const slot = slots[child];
        child++;
        out += before + (slot === undefined ? "" : part(renderValue(slot.values[0])));
    }
    return out + markup.slice(last);
}

/**
 * Renders a view to HTML, with the markers `hydrate()` needs. Effects
 * created while rendering (inside `each` rows, `when` branches, and
 * computed values) are disposed before it returns. A component called
 * before `renderToString` runs outside that scope, exactly as in the
 * browser, and owns its own effects; given a function that returns the
 * view, as in `renderToString(() => App())`, the component runs inside
 * the scope, so its effects and cleanups end with the render.
 */
export function renderToString(view: Renderable | (() => Renderable)): string
{
    const handle = scope(() => part(renderValue(produce(view))));
    handle.dispose();
    return handle.value;
}

/** A `<style>` element per `css` literal created so far, for the document head. */
export function renderStyles(): string
{
    let out = "";
    for (const styles of styleSheets())
    {
        out += `<style>${styles.text}</style>`;
    }
    return out;
}
