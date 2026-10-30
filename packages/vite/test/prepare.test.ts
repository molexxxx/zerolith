import { parseSync } from "vite";
import { describe, expect, it } from "vitest";
import { scan } from "zerolith";
import { type ModuleParser, PrepareError, prepareModule } from "@zerolith/vite";

const parse: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: filename.endsWith(".ts") ? "ts" : "js" });

function prepare(code: string, id = "/src/app.js"): string | null
{
    return prepareModule(code, id, parse, scan)?.code ?? null;
}

function offsetOf(code: string, id = "/src/app.js"): number
{
    try
    {
        prepareModule(code, id, parse, scan);
    }
    catch (error)
    {
        if (error instanceof PrepareError)
        {
            return error.offset;
        }
        throw error;
    }
    return -1;
}

describe("prepareModule", () =>
{
    it("leaves a module alone that imports no html from zerolith", () =>
    {
        expect(prepare("export const x = html`<p></p>`;\n")).toBeNull();
        expect(prepare("import { html } from \"other\";\nexport const x = html`<p></p>`;\n")).toBeNull();
        expect(prepare("import { render } from \"zerolith\";\nrender(1, \"#app\");\n")).toBeNull();
    });

    it("hoists the scan next to the literal and calls html with it", () =>
    {
        const out = prepare("import { html } from \"zerolith\";\nexport const view = (cls, name) => html`<p class=\"${cls}\">${name}</p>`;\n");
        expect(out).toMatch(/^import \{ prepared as __zl_prepared \} from "zerolith";import \{ html \} from "zerolith";\n/);
        expect(out).toContain("const __zl_t0 = __zl_prepared([\"<p class=\\\"\",\"\\\">\",\"</p>\"], \"<p zl$0><!--zl$--></p>\", [[1,\"class\",[\"\",\"\"]],[0,\"\",[]]]);");
        expect(out).toContain("export const view = (cls, name) => html(__zl_t0, cls, name);");
    });

    it("keeps the line count and lowers nested templates", () =>
    {
        const code = "import { html } from \"zerolith\";\n\nexport const list = (items) => html`\n    <ul>\n        ${items.map((item) => html`<li>${item}</li>`)}\n    </ul>\n`;\n";
        const out = prepare(code);
        expect(out?.split("\n").length).toBe(code.split("\n").length);
        expect(out).toContain("const __zl_t0 = __zl_prepared([\"\\n    <ul>\\n        \",\"\\n    </ul>\\n\"], \"\\n    <ul>\\n        <!--zl$-->\\n    </ul>\\n\", [[0,\"\",[]]]);");
        expect(out).toContain("const __zl_t1 = __zl_prepared([\"<li>\",\"</li>\"], \"<li><!--zl$--></li>\", [[0,\"\",[]]]);");
        expect(out).toContain("html(__zl_t0,\n\n items.map((item) => html(__zl_t1, item))\n\n)");
    });

    it("follows an alias and a namespace import", () =>
    {
        expect(prepare("import { html as h } from \"zerolith\";\nexport const v = h`<p></p>`;\n")).toContain("export const v = h(__zl_t0);");
        expect(prepare("import * as z from \"zerolith\";\nexport const v = z.html`<p></p>`;\n")).toContain("export const v = z.html(__zl_t0);");
    });

    it("hoists before the first statement so top-level renders see the templates", () =>
    {
        const out = prepare("import { html, render } from \"zerolith\";\nrender(html`<p></p>`, \"#app\");\n");
        expect(out?.split("\n")[1]).toBe("const __zl_t0 = __zl_prepared([\"<p></p>\"], \"<p></p>\", []);render(html(__zl_t0), \"#app\");");
    });

    it("refuses html declared or used other than as a tag", () =>
    {
        const value = "import { html } from \"zerolith\";\nconst tag = html;\n";
        expect(offsetOf(value)).toBe(value.indexOf("html;"));
        const shadow = "import { html } from \"zerolith\";\nexport function f(html) { return html`<p></p>`; }\n";
        expect(offsetOf(shadow)).toBe(shadow.indexOf("html)"));
        const member = "import * as z from \"zerolith\";\nconst tag = z.html;\n";
        expect(offsetOf(member)).toBe(member.indexOf("z.html;"));
    });

    it("allows the name html as a property key and in a type", () =>
    {
        expect(prepare("import { html } from \"zerolith\";\nexport const o = { html: 1 };\nexport const p = o.html;\n")).toBeNull();
        expect(prepare("import { html } from \"zerolith\";\nlet x: typeof html;\nexport const v = html`<p></p>`;\n", "/src/app.ts")).toContain("html(__zl_t0)");
    });

    it("reports a template the scanner refuses at the literal", () =>
    {
        const code = "import { html } from \"zerolith\";\nexport const v = (x) => html`<p ${x}></p>`;\n";
        expect(() => prepare(code)).toThrow(/binding_in_tag_position/);
        expect(offsetOf(code)).toBe(code.indexOf("html`"));
    });
});

describe("the shared fixture", () =>
{
    it("lowers to the committed output the Rust command line is held to", async () =>
    {
        const { readFile } = await import("node:fs/promises");
        const folder = new URL("./fixture-prepare/", import.meta.url);
        const input = await readFile(new URL("input.js", folder), "utf8");
        const output = await readFile(new URL("output.js", folder), "utf8");
        expect(prepare(input, "/src/input.js")).toBe(output);
    });
});
