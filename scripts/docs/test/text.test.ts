import { describe, expect, it } from "vitest";
import { headingText, stripTags } from "../text.ts";

describe("heading text", () =>
{
    it("decodes each entity once, so an escaped entity reads as written", () =>
    {
        expect(headingText("<code>Map&lt;K, V&gt;</code> &amp;lt; &quot;a&quot; &#39;b&#39; &amp; c")).toBe("Map<K, V> &lt; \"a\" 'b' & c");
    });

    it("removes every tag and every bracket an unfinished tag leaves", () =>
    {
        expect(stripTags("<scr<b>x</b>ipt>a</scr<i>ipt>")).toBe("xipt>aipt>");
        expect(stripTags("<<b>b>text<</b>/b>")).toBe("b>text/b>");
        expect(stripTags("text <script")).toBe("text script");
        expect(stripTags("plain")).toBe("plain");
    });
});
