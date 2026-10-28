import { describe, expect, it } from "vitest";
import { ZerolithError } from "zerolith";
import { ATTRIBUTE, BOOLEAN, CHILD, EVENT, PROPERTY, REF, scan } from "../src/template.js";

function codeOf(fn: () => unknown): string | undefined
{
    try
    {
        fn();
    }
    catch (error)
    {
        if (error instanceof ZerolithError)
        {
            return error.diagnostic.code;
        }
        throw error;
    }
    return undefined;
}

describe("scan", () =>
{
    it("marks child positions with a comment", () =>
    {
        const { markup, parts } = scan(["<p>", "</p>"]);
        expect(markup).toBe("<p><!--zl$--></p>");
        expect(parts).toEqual([{ kind: CHILD, index: -1, name: "", strings: [], count: 1 }]);
    });

    it("replaces a bound quoted attribute with a marker and keeps the static text around it", () =>
    {
        const { markup, parts } = scan(["<div class=\"a ", " b\" id=\"x\">", "</div>"]);
        expect(markup).toBe("<div zl$0 id=\"x\"><!--zl$--></div>");
        expect(parts[0]).toEqual({ kind: ATTRIBUTE, index: -1, name: "class", strings: ["a ", " b"], count: 1 });
        expect(parts[1]?.kind).toBe(CHILD);
    });

    it("handles unquoted and single-quoted values and several expressions in one value", () =>
    {
        const unquoted = scan(["<input value=", " disabled>"]);
        expect(unquoted.markup).toBe("<input zl$0 disabled>");
        expect(unquoted.parts[0]?.strings).toEqual(["", ""]);

        const single = scan(["<a title='", "'>x</a>"]);
        expect(single.markup).toBe("<a zl$0>x</a>");

        const multi = scan(["<p style=\"color: ", "; width: ", "px\"></p>"]);
        expect(multi.markup).toBe("<p zl$0></p>");
        expect(multi.parts[0]).toEqual({ kind: ATTRIBUTE, index: -1, name: "style", strings: ["color: ", "; width: ", "px"], count: 2 });
    });

    it("recognizes the boolean, property, and event prefixes and keeps the source case", () =>
    {
        const { parts } = scan(["<input ?disabled=", " .valueAsNumber=", " @keyDown=", " ref=", ">"]);
        expect(parts.map((part) => [part.kind, part.name])).toEqual([[BOOLEAN, "disabled"], [PROPERTY, "valueAsNumber"], [EVENT, "keyDown"], [REF, "ref"]]);
    });

    it("parses closing tags, comments, and raw text elements without binding into them", () =>
    {
        const { markup, parts } = scan(["<div><!-- note --><style>p { }</style><textarea>t</textarea></div>", ""]);
        expect(markup).toBe("<div><!-- note --><style>p { }</style><textarea>t</textarea></div><!--zl$-->");
        expect(parts).toHaveLength(1);
    });

    it("rejects bindings where they cannot be made safe", () =>
    {
        expect(codeOf(() => scan(["<", "></div>"]))).toBe("binding_in_tag_position");
        expect(codeOf(() => scan(["<div ", "></div>"]))).toBe("binding_in_tag_position");
        expect(codeOf(() => scan(["<!-- ", " -->"]))).toBe("binding_in_comment");
        expect(codeOf(() => scan(["<style>", "</style>"]))).toBe("binding_in_raw_text");
        expect(codeOf(() => scan(["<script>alert(1)</script>"]))).toBe("script_in_template");
        expect(codeOf(() => scan(["<div class=\"a"]))).toBe("template_unclosed_tag");
    });

    it("rejects bindings that would parse markup or run script", () =>
    {
        expect(codeOf(() => scan(["<div .innerHTML=", "></div>"]))).toBe("unsafe_property_binding");
        expect(codeOf(() => scan(["<iframe srcdoc=", "></iframe>"]))).toBe("unsafe_attribute_binding");
        expect(codeOf(() => scan(["<button onclick=", "></button>"]))).toBe("unsafe_attribute_binding");
        expect(codeOf(() => scan(["<input ?disabled=\"a ", "\">"]))).toBe("binding_not_single");
    });
});
