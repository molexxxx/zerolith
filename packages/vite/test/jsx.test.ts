import { parseSync } from "vite";
import { describe, expect, it } from "vitest";
import { type ModuleParser, lowerJsx } from "@zerolith/vite";

const parse: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: filename.endsWith(".tsx") ? "tsx" : "jsx" });
const HEAD = "import { html as __zl_html } from \"zerolith\"; ";

function lower(code: string, id = "/src/app.tsx"): string | null
{
    return lowerJsx(code, id, parse)?.code ?? null;
}

describe("lowerJsx", () =>
{
    it("leaves modules without JSX untouched", () =>
    {
        expect(lower("const a = 1 < 2;\nexport const b = `<p>${a}</p>`;\n")).toBeNull();
        expect(lower("export const x: Array<number> = [];\n")).toBeNull();
    });

    it("turns elements, text, and expressions into one template", () =>
    {
        const out = lower("const view = <main class=\"app\"><h1>Hello {name}</h1><p>plain</p></main>;\n");
        expect(out).toBe(`${HEAD}const view = (__zl_html\`<main class="app"><h1>Hello \${name}</h1><p>plain</p></main>\`);\n`);
    });

    it("maps the namespaces to the binding forms and keeps static attributes as markup", () =>
    {
        const out = lower("const v = <input id={id} prop:value={name} on:input={handle} bool:disabled={pending} ref={box} attr:title={t} autofocus data-x='1' />;\n");
        expect(out).toContain("<input id=${id} .value=${name} @input=${handle} ?disabled=${pending} ref=${box} title=${t} autofocus data-x='1'>");
    });

    it("calls components with their props and children", () =>
    {
        const out = lower("const v = <Counter start={1} label=\"n\" live>\n    <b>child</b>\n    second\n    {third}\n</Counter>;\n");
        expect(out).toContain("${Counter({ start: 1, label: \"n\", live: true, children: [(__zl_html`<b>child</b>`), \"second\", third] })}");
        expect(lower("const v = <Layout>{content}</Layout>;")).toContain("${Layout({ children: content })}");
        expect(lower("const v = <Nav.Item {...props} active />;")).toContain("${Nav.Item({ ...props, active: true })}");
        expect(lower("const v = <Empty />;")).toContain("${Empty({})}");
    });

    it("lowers fragments, nested JSX inside expressions, and JSX attribute values", () =>
    {
        expect(lower("const v = <><b>a</b> and <i>b</i></>;")).toContain("(__zl_html`<b>a</b> and <i>b</i>`)");
        const nested = lower("const v = <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;");
        expect(nested).toContain("<ul>${items.map((item) => (__zl_html`<li key=${item.id}>${item.name}</li>`))}</ul>");
        expect(lower("const v = <Card title={<b>t</b>} />;")).toContain("Card({ title: (__zl_html`<b>t</b>`) })");
    });

    it("applies JSX whitespace rules and escapes template characters", () =>
    {
        const out = lower("const v = (\n    <p>\n        first line\n        second line\n    </p>\n);\n");
        expect(out).toContain("<p>first line second line</p>");
        expect(lower("const v = <p>{\"a\"} `tick` and ${not}</p>;")).toContain("<p>${\"a\"} \\`tick\\` and $${not}</p>");
        expect(lower("const v = <p>{/* a comment */}x</p>;")).toContain("<p>x</p>");
    });

    it("keeps the module's line count", () =>
    {
        const source = "const v = (\n    <main>\n        <h1>{title}</h1>\n    </main>\n);\nexport const after = 1;\n";
        const out = lower(source) ?? "";
        expect(out.split("\n").length).toBe(source.split("\n").length);
        expect(out.split("\n")[5]).toBe("export const after = 1;");
    });

    it("refuses what a template cannot express", () =>
    {
        expect(() => lower("const v = <div {...props} />;")).toThrow(/spread attributes on <div>/);
        expect(() => lower("const v = <div>{...children}</div>;")).toThrow(/spread children/);
    });

    it("lowers .jsx the same way", () =>
    {
        expect(lower("const v = <p>{x}</p>;", "/src/app.jsx")).toBe(`${HEAD}const v = (__zl_html\`<p>\${x}</p>\`);`);
    });
});
