import { describe, expect, it } from "vitest";
import { highlight, identifiers, tokenize } from "../highlight.ts";

describe("code coloring", () =>
{
    it("marks keywords, strings, and comments in scripts", () =>
    {
        expect(highlight("const a = \"x\"; // note", "ts")).toBe("<span class=\"k\">const</span> a = <span class=\"s\">&quot;x&quot;</span>; <span class=\"c\">// note</span>");
    });

    it("colors template text as a string and the expressions inside it as code", () =>
    {
        expect(tokenize("html`<p>${count}</p>`", "ts")).toEqual([
            { kind: "plain", text: "html" },
            { kind: "string", text: "`<p>${" },
            { kind: "plain", text: "count" },
            { kind: "string", text: "}</p>`" }
        ]);
    });

    it("keeps JSX closing tags and division out of regular expressions", () =>
    {
        expect(tokenize("<li>{item}</li>", "tsx")).toEqual([{ kind: "plain", text: "<li>{item}</li>" }]);
        expect(tokenize("const half = total / 2 / 1;", "ts").filter((token) => token.kind === "string")).toEqual([]);
        expect(tokenize("const re = /a\\/b/g;", "ts").filter((token) => token.kind === "string").map((token) => token.text)).toEqual(["/a\\/b/g"]);
    });

    it("leaves property names that are also keywords uncolored", () =>
    {
        const keywords = tokenize("const options = { type: \"module\", from: 1 }; options.type;", "ts").filter((token) => token.kind === "keyword");
        expect(keywords.map((token) => token.text)).toEqual(["const"]);
    });

    it("escapes markup, quotes included, so example markup never becomes the page's own", () =>
    {
        expect(highlight("<a href=\"/x\">", "html")).toBe("&lt;<span class=\"k\">a</span> href=<span class=\"s\">&quot;/x&quot;</span>&gt;");
    });

    it("colors shell commands and comments", () =>
    {
        expect(highlight("npm install --global x # once", "sh")).toBe("<span class=\"k\">npm</span> install --global x <span class=\"c\"># once</span>");
    });

    it("lists the identifiers a script uses outside strings and comments", () =>
    {
        const used = identifiers("render(html`<p>${count}</p>`, \"#app\"); // computed");
        expect([...used].toSorted()).toEqual(["count", "html", "render"]);
    });
});
