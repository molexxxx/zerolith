import { Marked } from "marked";
import { describe, expect, it } from "vitest";
import { labeledTable } from "../tables.ts";

const markdown = new Marked({
    gfm: true,
    renderer: {
        table(token)
        {
            return labeledTable(this, token);
        }
    }
});

/** The `data-label` of every body cell in `html`, as written in the markup. */
function labels(html: string): string[]
{
    return Array.from(html.matchAll(/<td role="cell" data-label="([^"]*)"/g), (match) => match[1] ?? "");
}

describe("labeled tables", () =>
{
    it("labels each body cell with its column's header as plain text, with table roles on every part", () =>
    {
        const html = markdown.parse("| `Member` | What *it* is |\n| --- | --- |\n| `outlet()` | The page |\n| `href()` | A path |\n") as string;
        expect(labels(html)).toEqual(["Member", "What it is", "Member", "What it is"]);
        expect(html).toContain("<table role=\"table\">\n<thead role=\"rowgroup\">\n<tr role=\"row\">\n<th role=\"columnheader\"><code>Member</code></th>");
        expect(html).toContain("<td role=\"cell\" data-label=\"Member\"><code>outlet()</code></td>");
        expect(html).toContain("<tbody role=\"rowgroup\"><tr role=\"row\">");
    });

    it("escapes quotes, ampersands, and markup in a header's code and text, and leaves out a header's raw HTML", () =>
    {
        const html = markdown.parse("| `\"><img src=x onerror=alert(1)>` | Tom & \"Jerry\" | <scr<script>ipt>x</b> |\n| --- | --- | --- |\n| a | b | c |\n") as string;
        expect(labels(html)).toEqual(["&quot;&gt;&lt;img src=x onerror=alert(1)&gt;", "Tom &amp; &quot;Jerry&quot;", "&lt;script&gt;x"]);
        for (const label of labels(html))
        {
            expect(label).not.toMatch(/[<>"]/);
        }
    });

    it("writes a table with no body rows as its header alone", () =>
    {
        const html = markdown.parse("| A | B |\n| --- | --- |\n") as string;
        expect(html).toBe("<table role=\"table\">\n<thead role=\"rowgroup\">\n<tr role=\"row\">\n<th role=\"columnheader\">A</th>\n<th role=\"columnheader\">B</th>\n</tr>\n</thead>\n</table>\n");
    });
});
