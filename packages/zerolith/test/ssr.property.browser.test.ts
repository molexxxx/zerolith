import * as fc from "fast-check";
import { describe, it } from "vitest";
import { html } from "zerolith";
import { renderToString } from "zerolith/ssr";

/**
 * Randomized text and attribute values through the server renderer, read
 * back by the browser's HTML parser: it finds one element, with no element
 * inside, holding exactly the text and attribute value written, whatever
 * they hold, markup and the renderer's own markers included. The parser's
 * input rules apply: NUL is dropped from text and reads as U+FFFD in an
 * attribute, and line breaks compare as LF, since the parser reads a raw CR
 * LF or CR as LF while a CR written as a reference stays a CR.
 */

const pieces = fc.constantFrom(
    "<", ">", "&", "\"", "'", "</p>", "<script>", "-->", "<!--", "zl$0", "<!--zl$-->", " zl$1", "<!--zl:p-->",
    "&amp;", "&lt;", "${", "`", "\r\n", "\r", "\n", "\0",
    String.fromCodePoint(0x2028), String.fromCodePoint(0x1f600), String.fromCodePoint(0xfeff)
);

const values = fc.array(fc.oneof(pieces, fc.string({ maxLength: 8 })), { maxLength: 6 }).map((parts) => parts.join(""));

/** Line breaks as LF. */
function lines(value: string): string
{
    return value.replace(/\r\n?/g, "\n");
}

/** What the parser makes of text, line breaks aside: NUL dropped. */
function asText(value: string): string
{
    return lines(value).replaceAll("\0", "");
}

/** What the parser makes of an attribute value, line breaks aside: NUL as U+FFFD. */
function asAttribute(value: string): string
{
    return lines(value).replaceAll("\0", String.fromCodePoint(0xfffd));
}

describe("renderToString under randomized values", () =>
{
    it("writes text and attribute values the parser reads back exactly", () =>
    {
        fc.assert(fc.property(values, values, (content, title) =>
        {
            const body = new DOMParser().parseFromString(renderToString(html`<p title=${title}>${content}</p>`), "text/html").body;
            const paragraph = body.querySelector("p");
            return body.children.length === 1
                && paragraph !== null
                && paragraph.children.length === 0
                && lines(paragraph.getAttribute("title") ?? "") === asAttribute(title)
                && lines(paragraph.textContent ?? "") === asText(content);
        }), { numRuns: 2000 });
    });
});
