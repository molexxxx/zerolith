import * as fc from "fast-check";
import { describe, it } from "vitest";
import { safeUrl } from "../src/binding.js";

/**
 * Randomized checks of the URL rule both renderers share, against the
 * WHATWG URL parser and data URL processor that browsers implement: a URL
 * safeUrl lets through never parses to a scheme that runs script, and a
 * data URL it lets through never has a type that can.
 */

/** What the URL parser removes inside a scheme, tab, LF, and CR, most often nothing; and now and then a look-alike it keeps, which makes the scheme no scheme at all. */
const inner = fc.oneof(
    { weight: 12, arbitrary: fc.constant("") },
    { weight: 3, arbitrary: fc.constantFrom("\t", "\n", "\r") },
    { weight: 1, arbitrary: fc.constantFrom(" ", "\0", "\x01", "\x1f", "\x7f", String.fromCodePoint(0xa0), String.fromCodePoint(0x2028), String.fromCodePoint(0xfeff), "%09", "&#9;") }
);

/** What the URL parser strips before a URL: C0 controls and spaces. */
const lead = fc.constantFrom("", " ", "\t", "\n", "\r", "\0", "\x01", "\x0b", "\x1f");

/** A scheme name with each letter in either case and inner noise after each letter. */
function scheme(name: string): fc.Arbitrary<string>
{
    return fc.tuple(...[...name].map((letter) => fc.tuple(fc.boolean(), inner).map(([upper, gap]) => (upper ? letter.toUpperCase() : letter) + gap)))
        .map((parts) => parts.join(""));
}

/** URLs that run script or carry a type that can, as an attacker would write them. */
const dangerous = fc.constantFrom(
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:x", "java\tscript:x", "\x01javascript:x", "vbscript:x",
    "data:text/html,<script>alert(1)</script>", "data:image/svg+xml,<svg onload=alert(1)>", "data:application/xhtml+xml,<x/>",
    "data:text/html;base64,PHNjcmlwdD4=", "DATA:TEXT/HTML,x"
);

const payloads = fc.oneof(
    fc.constantFrom(
        "alert(1)", "//example.test/", "image/png,AAAA", "image/png;base64,AAAA", "IMAGE/GIF,AA", "image/svg+xml,<svg onload=alert(1)>",
        "text/html,<script>alert(1)</script>", "text/html;base64,PHNjcmlwdD4=", "application/xhtml+xml,<x/>", "image/png;x=text/html,AA",
        " image/png,AA", "image/pn\tg,AA", "ima\x01ge/png,AA"
    ),
    fc.string({ unit: "binary", maxLength: 40 })
);

const hostile = fc.tuple(fc.array(lead, { maxLength: 3 }), fc.oneof(scheme("javascript"), scheme("vbscript"), scheme("data"), scheme("http")), inner, fc.constantFrom(":", ":", ":", "&colon;", "%3a"), payloads)
    .map(([before, name, gap, colon, rest]) => before.join("") + name + gap + colon + rest);

const urls = fc.oneof({ weight: 6, arbitrary: hostile }, { weight: 2, arbitrary: dangerous }, { weight: 2, arbitrary: fc.string({ unit: "binary", maxLength: 60 }) }, { weight: 1, arbitrary: fc.webUrl() });

/** Media types a browser renders as a document that can run script: HTML, XHTML, SVG, and XML of any kind, which can hold XHTML. Any other type, an unknown one included, cannot. */
const scriptable = new Set(["text/html", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/xml"]);

function canRunScript(type: string): boolean
{
    return scriptable.has(type) || type.endsWith("+xml");
}

describe("safeUrl under randomized input", () =>
{
    it("lets through no URL that parses to a scheme that runs script", () =>
    {
        fc.assert(fc.property(urls, (value) =>
        {
            if (!safeUrl(value) || !URL.canParse(value, "https://example.test/"))
            {
                return true;
            }
            const { protocol } = new URL(value, "https://example.test/");
            return protocol !== "javascript:" && protocol !== "vbscript:";
        }), { numRuns: 20000 });
    });

    it("lets through only data URLs whose type cannot run script", async () =>
    {
        await fc.assert(fc.asyncProperty(urls, async (value) =>
        {
            if (!safeUrl(value) || !URL.canParse(value, "https://example.test/"))
            {
                return true;
            }
            const url = new URL(value, "https://example.test/");
            if (url.protocol !== "data:")
            {
                return true;
            }
            const response = await fetch(url).catch(() => undefined);
            const type = response?.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
            return type === undefined || !canRunScript(type);
        }), { numRuns: 5000 });
    });
});
