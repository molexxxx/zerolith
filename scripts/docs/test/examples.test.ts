import { describe, expect, it } from "vitest";
import { applicationPath, importsFor, regionParts, renderExample } from "../examples.ts";

const source = [
    "import { afterEach, expect, it } from \"vitest\";",
    "import { type Root, computed, html, render, signal } from \"zerolith\";",
    "import { type Note, noteSchema } from \"../fixtures/notes/schema.ts\";",
    "import { routes as apiRoutes } from \"./api.ts\";",
    "",
    "afterEach(() => undefined);",
    "",
    "it(\"counts\", () =>",
    "{",
    "    // #region counter",
    "    const count = signal(0);",
    "    render(html`<p>${count}</p>`, \"#app\");",
    "    // #endregion counter",
    "    expect(document.body.textContent).toBe(\"0\");",
    "    // #region counter",
    "",
    "    count.set(1);                       // computed values follow too",
    "    // #endregion counter",
    "    // #region typed",
    "    const app: Root = render(html`<p></p>`, \"#app\");",
    "    const note: Note = { title: String(apiRoutes) };",
    "    // #endregion typed",
    "    // #region checked",
    "    expect(app).toBeDefined();",
    "    // #endregion checked",
    "});"
].join("\n");

describe("executed examples", () =>
{
    it("joins the parts of a region, leaving out the checks between them", () =>
    {
        expect(regionParts(source, "counter")).toEqual([
            "    const count = signal(0);\n    render(html`<p>${count}</p>`, \"#app\");",
            "\n    count.set(1);                       // computed values follow too"
        ]);
    });

    it("shows a region as application code with the imports it uses", () =>
    {
        expect(renderExample(source, "packages/x/test/examples/counter.test.ts", "counter", [], "guide.md")).toBe([
            "```ts",
            "import { html, render, signal } from \"zerolith\";",
            "",
            "const count = signal(0);",
            "render(html`<p>${count}</p>`, \"#app\");",
            "",
            "count.set(1);                       // computed values follow too",
            "```"
        ].join("\n"));
    });

    it("keeps type imports, aliases, and application paths for relative modules", () =>
    {
        const code = regionParts(source, "typed").join("\n");
        expect(importsFor(code, source, false)).toEqual([
            "import { type Root, html, render } from \"zerolith\";",
            "import type { Note } from \"./notes/schema.ts\";",
            "import { routes as apiRoutes } from \"./api.ts\";"
        ]);
        expect(applicationPath("../../../client/test/fixtures/notes.api.ts")).toBe("./notes.api.ts");
        expect(applicationPath("./note-schema.ts")).toBe("./note-schema.ts");
        expect(applicationPath("zerolith/ssr")).toBe("zerolith/ssr");
    });

    it("refuses a region that shows a check, unless the example is a test", () =>
    {
        expect(() => renderExample(source, "a.test.ts", "checked", [], "guide.md")).toThrow(/shows a test check/);
        expect(renderExample(source, "a.test.ts", "checked", ["test"], "guide.md")).toBe("```ts\nimport { expect } from \"vitest\";\n\nexpect(app).toBeDefined();\n```");
    });

    it("shows excerpts and whole files verbatim, and refuses unknown options and regions", () =>
    {
        expect(renderExample(source, "a.test.ts", "typed", ["excerpt", "js"], "guide.md")).toBe("```js\nconst app: Root = render(html`<p></p>`, \"#app\");\nconst note: Note = { title: String(apiRoutes) };\n```");
        expect(renderExample("{\n    \"welcome\": \"Hi\"\n}\n", "fixtures/en.json", undefined, [], "guide.md")).toBe("```json\n{\n    \"welcome\": \"Hi\"\n}\n```");
        expect(() => renderExample(source, "a.test.ts", "counter", ["verbatim"], "guide.md")).toThrow(/unknown include option verbatim/);
        expect(() => renderExample(source, "a.test.ts", "missing", [], "guide.md")).toThrow(/region missing not found/);
    });
});
