/**
 * The server renderer: turns a view into an HTML string with no DOM. It
 * works from the same scan of the template strings the browser uses, so
 * markup, escaping, and URL rules cannot differ between the two. Signals
 * are read once; `each` and `when` render their current state; property,
 * event, and ref bindings are client-only and render nothing.
 */
import { URL_ATTRIBUTES, describe, isNothing, isText, join, safeUrl } from "./binding.js";
import { styleSheets } from "./css.js";
import { diagnostic, fail, report } from "./diagnostics.js";
import { type TemplateView, isDirective, isRawHtml, isTemplate, resolveDirective } from "./render.js";
import { isSignal, scope } from "./signals.js";
import { ATTRIBUTE, BOOLEAN, CHILD, type PartSpec, scan } from "./template.js";

const scanned: WeakMap<TemplateStringsArray, { markup: string; parts: readonly PartSpec[] }> = new WeakMap();

const MARKER = /<!--zl\$-->|\s*zl\$(\d+)/g;

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
        return renderValue(resolveDirective(resolved));
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
            out += renderValue(item);
        }
        return out;
    }
    throw fail("unrenderable_value", { type: describe(resolved) });
}

function renderTemplate(view: TemplateView): string
{
    let entry = scanned.get(view.strings);
    if (entry === undefined)
    {
        entry = scan(view.strings);
        scanned.set(view.strings, entry);
    }
    const { markup, parts } = entry;
    const slots: Array<{ spec: PartSpec; values: readonly unknown[] }> = [];
    let offset = 0;
    for (const spec of parts)
    {
        slots.push({ spec, values: view.values.slice(offset, offset + spec.count) });
        offset += spec.count;
    }
    let child = 0;
    return markup.replace(MARKER, (match, index: string | undefined) =>
    {
        if (index !== undefined)
        {
            const slot = slots[Number(index)];
            return slot === undefined ? "" : renderAttribute(slot.spec, slot.values);
        }
        while (child < slots.length && slots[child]?.spec.kind !== CHILD)
        {
            child++;
        }
        const slot = slots[child];
        child++;
        return slot === undefined ? "" : renderValue(slot.values[0]);
    });
}

/**
 * Renders a view to HTML. Effects created while rendering (inside `each`
 * rows, `when` branches, and computed values) are disposed before it
 * returns. A component called before `renderToString` runs outside that
 * scope, exactly as in the browser, and owns its own effects.
 */
export function renderToString(view: unknown): string
{
    const handle = scope(() => renderValue(view));
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
