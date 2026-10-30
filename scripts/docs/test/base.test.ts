import { describe, expect, it } from "vitest";
import { normalizeBase, rebaseHtml, rebaseMarkdown, rebasePath } from "../base.ts";

describe("the docs base path", () =>
{
    it("normalizes to leading and trailing slashes, with empty meaning the root", () =>
    {
        expect(normalizeBase(undefined)).toBe("/");
        expect(normalizeBase("")).toBe("/");
        expect(normalizeBase("/")).toBe("/");
        expect(normalizeBase("/zerolith")).toBe("/zerolith/");
        expect(normalizeBase("zerolith/")).toBe("/zerolith/");
    });

    it("rebases root-relative paths only", () =>
    {
        expect(rebasePath("/guide/forms/", "/zerolith/")).toBe("/zerolith/guide/forms/");
        expect(rebasePath("//cdn.example/x.js", "/zerolith/")).toBe("//cdn.example/x.js");
        expect(rebasePath("https://example.com/", "/zerolith/")).toBe("https://example.com/");
        expect(rebasePath("/guide/forms/", "/")).toBe("/guide/forms/");
    });

    it("rebases href, src, and the import map in a page", () =>
    {
        const page = "<a href=\"/\">home</a><link href=\"/styles.css\"><script type=\"importmap\">{\"imports\":{\"zerolith\":\"/zerolith/index.js\"}}</script><script src=\"/island.js\"></script><a href=\"https://x.dev/\">out</a><a href=\"#top\">top</a><code>href=&quot;/kept&quot;</code>";
        expect(rebaseHtml(page, "/zerolith/")).toBe("<a href=\"/zerolith/\">home</a><link href=\"/zerolith/styles.css\"><script type=\"importmap\">{\"imports\":{\"zerolith\":\"/zerolith/zerolith/index.js\"}}</script><script src=\"/zerolith/island.js\"></script><a href=\"https://x.dev/\">out</a><a href=\"#top\">top</a><code>href=&quot;/kept&quot;</code>");
        expect(rebaseHtml(page, "/")).toBe(page);
    });

    it("rebases Markdown links outside fenced code", () =>
    {
        const markdown = "See [forms](/guide/forms/) and [out](https://x.dev/).\n\n```ts\nconst link = \"[a](/b)\";\n```\n[after](/e/)";
        expect(rebaseMarkdown(markdown, "/zerolith/")).toBe("See [forms](/zerolith/guide/forms/) and [out](https://x.dev/).\n\n```ts\nconst link = \"[a](/b)\";\n```\n[after](/zerolith/e/)");
    });
});
