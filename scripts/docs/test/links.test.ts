import { describe, expect, it } from "vitest";
import { brokenLinks, mapLinks, sitePath } from "../links.ts";

function upper(target: string): string
{
    return target.toUpperCase();
}

describe("docs links", () =>
{
    it("turn page files and full site addresses into site paths", () =>
    {
        expect(sitePath("structure.md", "guide", "docs/guide/a.md")).toBe("/guide/structure/");
        expect(sitePath("index.md#install", "guide", "docs/guide/a.md")).toBe("/guide/#install");
        expect(sitePath("../learn/state.md", "guide", "docs/guide/a.md")).toBe("/learn/state/");
        expect(sitePath("../guide/forms.md#fields", "learn", "docs/learn/a.md")).toBe("/guide/forms/#fields");
        expect(sitePath("https://zerolith.dev/e/template_frozen_read/", "guide", "docs/guide/a.md")).toBe("/e/template_frozen_read/");
        expect(sitePath("https://vite.dev", "guide", "docs/guide/a.md")).toBe("https://vite.dev");
        expect(sitePath("#effects", "guide", "docs/guide/a.md")).toBe("#effects");
    });

    it("refuse root-relative links and files outside the docs", () =>
    {
        expect(() => sitePath("/guide/structure/", "guide", "docs/guide/a.md")).toThrow("docs/guide/a.md: the link /guide/structure/ resolves on the docs site only; link the page's file, such as structure.md, or the full address https://zerolith.dev/guide/structure/, so the link works on GitHub too");
        expect(() => sitePath("../ROADMAP.md", "guide", "docs/guide/a.md")).toThrow(/is not a page of the docs/);
    });

    it("leave code blocks and code spans alone", () =>
    {
        expect(mapLinks("[a](x.md) `[b](y.md)` [c](z.md)\n```md\n[d](w.md)\n```", upper)).toBe("[a](X.MD) `[b](y.md)` [c](Z.MD)\n```md\n[d](w.md)\n```");
    });

    it("are broken when the site does not serve their path or no id on the page they lead to carries their fragment", () =>
    {
        const rendered = new Map([
            ["/a/", "<h2 id=\"setup\">Setup</h2><a href=\"/b/#usage\">b</a><a href=\"/b/#gone\">b</a><a href=\"#setup\">top</a><a href=\"#missing\">x</a>"],
            ["/b/", "<h2 id=\"usage\">Usage</h2><a href=\"/c/\">c</a><a href=\"/playground/#example=counter\">p</a><a href=\"/llms.txt#x\">l</a>"],
            ["/playground/", "<div></div>"]
        ]);
        const known = new Set(["/a/", "/b/", "/playground/", "/llms.txt"]);
        expect(brokenLinks(known, rendered)).toEqual(["/a/ -> /b/#gone", "/a/ -> #missing", "/b/ -> /c/"]);
    });
});
