import { parseSync } from "vite";
import { describe, expect, it } from "vitest";
import { type ModuleParser, lintModule, position } from "@zerolith/vite";

const parse: ModuleParser = (filename, code) => parseSync(filename, code, { sourceType: "module", lang: "js" });

function codes(code: string): string[]
{
    return lintModule(code, "/src/app.js", parse).map((finding) => finding.code);
}

describe("lintModule", () =>
{
    it("flags a .get() read bound in a template and leaves live bindings alone", () =>
    {
        expect(codes("const v = html`<p>${count.get()}</p>`;")).toEqual(["template_frozen_read"]);
        expect(codes("const v = html`<p title=${item.get().name}>${a.b.get()}</p>`;")).toEqual(["template_frozen_read", "template_frozen_read"]);
        expect(codes("const v = html`<p>${count}</p><p>${computed(() => item.get().name)}</p><button @click=${() => count.set(count.get() + 1)}>x</button>`;")).toEqual([]);
        expect(codes("const v = html`<p>${map.get(key)}</p>`;")).toEqual([]);
        expect(codes("const v = other`<p>${count.get()}</p>`;")).toEqual([]);
        expect(codes("const v = __zl_html`<p>${count.get()}</p>`;")).toEqual(["template_frozen_read"]);
    });

    it("flags the static accessibility defects it can see", () =>
    {
        expect(codes("const v = html`<img src=\"a.png\">`;")).toEqual(["image_without_alt"]);
        expect(codes("const v = html`<img src=${src} alt=${text}><img alt=\"\" src=\"b.png\">`;")).toEqual([]);
        expect(codes("const v = html`<button></button><button aria-label=\"Close\"></button><button>${label}</button><button>Go</button>`;")).toEqual(["button_without_name"]);
        expect(codes("const v = html`<iframe src=\"x\"></iframe><iframe title=\"Player\" src=\"y\"></iframe>`;")).toEqual(["frame_without_title"]);
    });

    it("reports offsets in source order and positions them", () =>
    {
        const code = "const a = 1;\nconst v = html`<img src=\"a.png\">\n<p>${count.get()}</p>`;";
        const findings = lintModule(code, "/src/app.js", parse);
        expect(findings.map((finding) => finding.code)).toEqual(["image_without_alt", "template_frozen_read"]);
        expect(position(code, findings[0]?.offset ?? 0)).toEqual({ line: 2, column: 16 });
        expect(position(code, findings[1]?.offset ?? 0)).toEqual({ line: 3, column: 6 });
    });

    it("yields nothing for modules without templates or that do not parse", () =>
    {
        expect(codes("const a = 1;")).toEqual([]);
        expect(codes("const v = html`<img>`; const (")).toEqual([]);
    });
});
