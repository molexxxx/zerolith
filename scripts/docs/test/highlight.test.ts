import { describe, expect, it } from "vitest";
import { highlight, identifiers, tokenize } from "../highlight.ts";

describe("code coloring", () =>
{
    it("marks keywords, strings, and comments in scripts", () =>
    {
        expect(highlight("const a = \"x\"; // note", "ts")).toBe("<span class=\"k\">const</span> a = <span class=\"s\">&quot;x&quot;</span>; <span class=\"c\">// note</span>");
    });

    it("reads an html template as markup with its bindings as the live parts", () =>
    {
        expect(tokenize("html`<p class=\"a ${tone}\" @click=${go}>${count}</p>`", "ts")).toEqual([
            { kind: "plain", text: "html" },
            { kind: "string", text: "`" },
            { kind: "plain", text: "<" },
            { kind: "tag", text: "p" },
            { kind: "plain", text: " " },
            { kind: "attribute", text: "class" },
            { kind: "plain", text: "=" },
            { kind: "string", text: "\"a " },
            { kind: "binding", text: "${" },
            { kind: "plain", text: "tone" },
            { kind: "binding", text: "}" },
            { kind: "string", text: "\"" },
            { kind: "plain", text: " " },
            { kind: "binding", text: "@" },
            { kind: "attribute", text: "click" },
            { kind: "plain", text: "=" },
            { kind: "binding", text: "${" },
            { kind: "plain", text: "go" },
            { kind: "binding", text: "}" },
            { kind: "plain", text: ">" },
            { kind: "binding", text: "${" },
            { kind: "plain", text: "count" },
            { kind: "binding", text: "}" },
            { kind: "plain", text: "</" },
            { kind: "tag", text: "p" },
            { kind: "plain", text: ">" },
            { kind: "string", text: "`" }
        ]);
    });

    it("reads a css template as styles and leaves other templates as strings", () =>
    {
        expect(highlight("css`h2 { margin: 0; }`", "ts")).toBe("css<span class=\"s\">`</span><span class=\"t\">h2</span> { <span class=\"a\">margin</span>: <span class=\"n\">0</span>; }<span class=\"s\">`</span>");
        expect(highlight("`/api/${id}`", "ts")).toBe("<span class=\"s\">`/api/${</span>id<span class=\"s\">}`</span>");
    });

    it("reads JSX as markup, with braces and binding namespaces as the live parts", () =>
    {
        expect(highlight("const v = <Card on:click={go}>Hi {name}</Card>;", "tsx")).toBe(
            "<span class=\"k\">const</span> v = &lt;<span class=\"t\">Card</span> <span class=\"b\">on:</span><span class=\"a\">click</span>=<span class=\"b\">{</span>go<span class=\"b\">}</span>&gt;Hi <span class=\"b\">{</span>name<span class=\"b\">}</span>&lt;/<span class=\"t\">Card</span>&gt;;");
        expect(tokenize("const half = total / 2 / 1;", "ts").filter((token) => token.kind === "string")).toEqual([]);
        expect(tokenize("const re = /a\\/b/g;", "ts").filter((token) => token.kind === "string").map((token) => token.text)).toEqual(["/a\\/b/g"]);
        expect(tokenize("const ok = a < b && c > d;", "tsx").filter((token) => token.kind === "tag")).toEqual([]);
    });

    it("colors numbers and literals", () =>
    {
        expect(highlight("const x = [1, 2.5, true, null];", "ts")).toBe("<span class=\"k\">const</span> x = [<span class=\"n\">1</span>, <span class=\"n\">2.5</span>, <span class=\"n\">true</span>, <span class=\"n\">null</span>];");
    });

    it("leaves property names that are also keywords uncolored", () =>
    {
        const keywords = tokenize("const options = { type: \"module\", from: 1 }; options.type;", "ts").filter((token) => token.kind === "keyword");
        expect(keywords.map((token) => token.text)).toEqual(["const"]);
    });

    it("escapes markup, quotes included, so example markup never becomes the page's own", () =>
    {
        expect(highlight("<a href=\"/x\">", "html")).toBe("&lt;<span class=\"t\">a</span> <span class=\"a\">href</span>=<span class=\"s\">&quot;/x&quot;</span>&gt;");
    });

    it("colors shell commands and comments", () =>
    {
        expect(highlight("npm install --global x # once", "sh")).toBe("<span class=\"k\">npm</span> install --global x <span class=\"c\"># once</span>");
    });

    it("lists the identifiers a script uses outside strings, comments, and template text", () =>
    {
        const used = identifiers("render(html`<b>Count ${count}</b>`, \"#app\"); // computed");
        expect([...used].toSorted()).toEqual(["b", "count", "html", "render"]);
        expect(identifiers("const v = <Card title={t} />;").has("Card")).toBe(true);
    });
});
