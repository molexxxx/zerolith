import { describe, expect, it } from "vitest";
import { css } from "zerolith";

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
