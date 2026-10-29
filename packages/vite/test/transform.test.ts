import { parseSync } from "vite";
import { describe, expect, it } from "vitest";
import { type ModuleParser, transformModule } from "@zerolith/vite";

const parse: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: "js" });

function rewrite(code: string): string | null
{
    return transformModule(code, "/src/app.js", parse)?.code ?? null;
}

const HEAD = "import * as __zl$ from \"@zerolith/vite/runtime\";";
const FOOTER = "if (import.meta.hot) { import.meta.hot.dispose(__zl$.save); import.meta.hot.accept(__zl$.accept); }";

describe("transformModule", () =>
{
    it("leaves modules without components or roots untouched", () =>
    {
        expect(rewrite("const x = 1;\n")).toBeNull();
        expect(rewrite("export function helper() { return 1; }\n")).toBeNull();
        expect(rewrite("export class Store {}\n")).toBeNull();
        expect(rewrite("import { html } from \"zerolith\";\nexport const Title = \"x\";\n")).toBeNull();
        expect(rewrite("import { render } from \"zerolith\";\nexport { render };\n")).toBeNull();
    });

    it("registers exported function declarations ahead of the module body so hoisting still holds", () =>
    {
        const out = rewrite("export function App()\n{\n    return 1;\n}\n");
        expect(out).toBe(`${HEAD} var App = __zl$.component(import.meta.hot, "App", App$); function App$()\n{\n    return 1;\n}\nexport { App };\n${FOOTER}`);
    });

    it("registers exported arrow and function expression components after their declaration and re-exports their siblings", () =>
    {
        const out = rewrite("export const limit = 3, Row = (item) => item, Cell = function () {};\n");
        expect(out).toContain("const limit = 3, Row$ = (item) => item, Cell$ = function () {}");
        expect(out).toContain("var Row = __zl$.component(import.meta.hot, \"Row\", Row$); var Cell = __zl$.component(import.meta.hot, \"Cell\", Cell$);");
        expect(out).toContain("export { limit, Row, Cell };");
        expect(out).not.toContain("export const");
    });

    it("handles default exports and export lists", () =>
    {
        const out = rewrite("export default function Page() {}\nfunction Aside() {}\nconst Note = () => 1;\nexport { Aside, Note as Footnote };\n");
        expect(out).toContain("var Page = __zl$.component(import.meta.hot, \"Page\", Page$); var Aside = __zl$.component(import.meta.hot, \"Aside\", Aside$);");
        expect(out).toContain("Page$); var Aside = __zl$.component(import.meta.hot, \"Aside\", Aside$); function Page$() {}\n");
        expect(out).toContain("function Aside$() {}");
        expect(out).toContain("const Note$ = () => 1;");
        expect(out).toContain("var Note = __zl$.component(import.meta.hot, \"Note\", Note$);");
        expect(out).toContain("export default Page;");
        expect(out).toContain("export { Aside, Note as Footnote };");
    });

    it("skips lowercase, anonymous, and non-function exports", () =>
    {
        const out = rewrite("export function App() {}\nexport default () => 1;\nexport const Limit = 3;\nexport function helper() {}\nexport class Store {}\n");
        expect(out).toContain("var App = __zl$.component(import.meta.hot, \"App\", App$);");
        expect(out).not.toContain("Limit$");
        expect(out).not.toContain("helper$");
        expect(out).not.toContain("Store$");
        expect(out).toContain("export default () => 1;");
    });

    it("routes render and hydrate calls through the runtime, following import aliases", () =>
    {
        const out = rewrite("import { render as mount, hydrate } from \"zerolith\";\nmount(App(), document.body);\nhydrate({ view: 1 }, el);\nother(App(), el);\nmount(App());\n");
        expect(out).toContain("__zl$.render(() => (App()), document.body);");
        expect(out).toContain("__zl$.hydrate(() => ({ view: 1 }), el);");
        expect(out).toContain("\nother(App(), el);\n");
        expect(out).toContain("\nmount(App());\n");
        expect(out?.endsWith(FOOTER)).toBe(true);
    });

    it("ignores render imported from anywhere else", () =>
    {
        expect(rewrite("import { render } from \"lit\";\nrender(App(), document.body);\n")).toBeNull();
    });

    it("keeps every original line in place and emits an identity map", () =>
    {
        const source = "import { render } from \"zerolith\";\n\nexport function App()\n{\n    return 1;\n}\n\nrender(App(), document.body);\n";
        const result = transformModule(source, "/src/main.js", parse);
        expect(result).not.toBeNull();
        const lines = result?.code.split("\n") ?? [];
        expect(lines[2]).toBe("function App$()");
        expect(lines[7]).toBe("__zl$.render(() => (App()), document.body);");
        expect(lines.at(-1)).toBe(FOOTER);
        expect(result?.map.mappings.split(";")).toHaveLength(lines.length);
        expect(result?.map.mappings.startsWith("AAAA;AACA;AACA")).toBe(true);
        expect(result?.map.sources).toEqual(["/src/main.js"]);
    });

    it("returns null when the module does not parse", () =>
    {
        expect(rewrite("export function (")).toBeNull();
    });
});
