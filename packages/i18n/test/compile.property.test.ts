import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as fc from "fast-check";
import { parseAst } from "rolldown/parseAst";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compileIndex, compileMessages } from "@zerolith/i18n/compile";
import { escaped, escapes } from "../../../scripts/test/generated-code.ts";

/**
 * Randomized catalogs through the compiler. Any text a message holds comes
 * back from its function exactly; and whatever the text, the keys, the
 * locale, and the source name hold, the module parses, holds none of the
 * code the escapes carry, which they could only put there by escaping a
 * string or a comment, and holds no `</script` or `<!--` that would end or
 * disturb a script element inlining it.
 */

let folder = "";
let counter = 0;

beforeAll(async () =>
{
    folder = await mkdtemp(join(tmpdir(), "zerolith-i18n-property-"));
});

afterAll(async () =>
{
    await rm(folder, { recursive: true, force: true });
});

/** Any character MessageFormat allows in text: every code point but NUL and the surrogates. */
const character = fc.integer({ min: 1, max: 0x10ffff }).filter((code) => code < 0xd800 || code > 0xdfff).map((code) => String.fromCodePoint(code));

const texts = fc.array(fc.oneof(escapes, fc.constantFrom("</script><!--", "<", ">", "\\"), fc.string({ unit: character, maxLength: 12 })), { maxLength: 4 }).map((parts) => parts.join(""));

/** A message whose whole pattern is the text, quoted so leading and trailing whitespace and a leading `.` stay text. */
function quoted(text: string): string
{
    return `{{${text.replace(/[\\{}]/g, (match) => `\\${match}`)}}}`;
}


describe("the compiler under randomized catalogs", () =>
{
    it("gives every message's text back exactly", { timeout: 30000 }, async () =>
    {
        await fc.assert(fc.asyncProperty(fc.array(texts, { minLength: 1, maxLength: 8 }), async (messages) =>
        {
            const catalog = Object.fromEntries(messages.map((text, index) => [`m${index}`, quoted(text)]));
            const file = join(folder, `catalog-${counter++}.js`);
            await writeFile(file, compileMessages("en", catalog, { language: "js" }).code);
            const module = (await import(pathToFileURL(file).href)) as Record<string, () => string>;
            messages.forEach((text, index) => expect(module[`m${index}`]?.()).toBe(text));
        }), { numRuns: 60 });
    });

    it("writes modules that parse and run nothing the catalog holds", () =>
    {
        fc.assert(fc.property(texts, texts, texts, texts, (text, key, locale, source) =>
        {
            const catalog = { [`k${key}`]: quoted(text), plain: quoted(text) };
            let modules: string[];
            try
            {
                modules = [compileMessages(locale, catalog, { language: "js", source }).code, compileIndex([locale, "en"], { language: "js" })];
            }
            catch (error)
            {
                return error instanceof Error && error.message.startsWith("zerolith/i18n: ");
            }
            for (const code of modules)
            {
                expect(escaped(parseAst(code, { lang: "js", sourceType: "module" })), code).toBe(false);
                expect(code).not.toMatch(/<\/script|<!--/i);
            }
            return true;
        }), { numRuns: 300 });
    });
});
