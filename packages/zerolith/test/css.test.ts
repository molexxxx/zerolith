import { describe, expect, it } from "vitest";
import { css } from "zerolith";
import { styleFile } from "zerolith/internal";
import { renderStyles } from "zerolith/ssr";

describe("css without a document", () =>
{
    it("derives a stable scope class from the text and composes other css results", () =>
    {
        const base = css`.a { color: red; }`;
        const again = css`.a { color: red; }`;
        expect(again).toBe(base);
        expect(base.scope).toMatch(/^zl-[0-9a-z]+$/);
        expect(String(base)).toBe(`zl-s ${base.scope}`);

        const composed = css`${base} .b { width: ${10}px; }`;
        expect(composed.text).toBe(`@scope (.${composed.scope}) to (:scope .zl-s > *) {\n.a { color: red; } .b { width: 10px; }\n}`);
    });

    it("rejects strings with a coded error", () =>
    {
        const color = "red" as unknown as number;
        expect(() => css`.a { color: ${color}; }`).toThrow(/css_value_not_allowed/);
    });
});

describe("stylesheet files without a document", () =>
{
    it("keys the scope to the file's name and path, not its text", () =>
    {
        const card = styleFile("src/card.css", ".title { color: red; }");
        expect(card.scope).toMatch(/^zl-card-[0-9a-z]+$/);
        expect(String(card)).toBe(`zl-s ${card.scope}`);
        expect(card.text).toBe(`@scope (.${card.scope}) to (:scope .zl-s > *) {\n.title { color: red; }\n}`);

        const same = styleFile("src/other/card.css", ".title { color: red; }");
        expect(same.scope).toMatch(/^zl-card-[0-9a-z]+$/);
        expect(same.scope).not.toBe(card.scope);
        expect(styleFile("src/Order Summary.module.css", "").scope).toMatch(/^zl-order-summary-module-[0-9a-z]+$/);
        expect(styleFile("src/\u00e9t\u00e9.css", "").scope).toMatch(/^zl-t-[0-9a-z]+$/);
        expect(styleFile("src/\u65e5\u672c.css", "").scope).toMatch(/^zl-[0-9a-z]+$/);
    });

    it("replaces the rules of a file loaded again and keeps its scope", () =>
    {
        const first = styleFile("src/panel.css", ":scope { gap: 4px; }");
        const again = styleFile("src/panel.css", ":scope { gap: 9px; }");
        expect(again).toBe(first);
        expect(first.text).toBe(`@scope (.${first.scope}) to (:scope .zl-s > *) {\n:scope { gap: 9px; }\n}`);
        expect(renderStyles()).toContain(`<style>${first.text}</style>`);
        expect(renderStyles()).not.toContain("gap: 4px");
    });

    it("composes into a css literal like any other styles", () =>
    {
        const base = styleFile("src/base.css", ".a { color: red; }");
        const composed = css`${base} .b { width: ${10}px; }`;
        expect(composed.text).toBe(`@scope (.${composed.scope}) to (:scope .zl-s > *) {\n.a { color: red; } .b { width: 10px; }\n}`);
    });
});
