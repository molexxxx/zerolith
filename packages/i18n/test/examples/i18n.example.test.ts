// Executed examples for the internationalization guide. The catalog and its
// compiled module are fixtures the guide shows; the test checks that the
// module is what the compiler writes for the catalog today.
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, resource } from "zerolith";
import { createLocale, formatters, negotiateLocale } from "@zerolith/i18n";
import { compileIndex, compileMessages } from "@zerolith/i18n/compile";
import { notesCount, savedAt, welcome } from "../fixtures/messages/en.ts";
import { loaders, locales } from "../fixtures/messages/index.ts";

let printed: unknown[][] = [];

beforeEach(() =>
{
    printed = [];
    vi.spyOn(console, "log").mockImplementation((...values: unknown[]) =>
    {
        printed.push(values);
    });
});

afterEach(() =>
{
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("internationalization guide", () =>
{
    it("locale", () =>
    {
        const request = new Request("https://notes.example/", { headers: { "accept-language": "de-AT,de;q=0.9,en;q=0.5" } });
        // #region locale
        const locale = createLocale({
            supported: ["en", "de", "ar"],
            // An Accept-Language header on the server, navigator.languages in the browser:
            initial: request.headers.get("accept-language")
        });
        const format = formatters(locale.locale);
        const euros = { style: "currency", currency: "EUR" } as const;
        const total = computed(() => format.number(1234.5, euros));

        console.log(locale.locale.get());       // "de", for "de-AT,de;q=0.9,en;q=0.5"
        console.log(total.get());               // "1.234,50 €"

        locale.set("ar-EG");
        console.log(locale.direction.get());    // "rtl"
        // #endregion locale
        expect(printed).toEqual([["de"], ["1.234,50 €"], ["rtl"]]);
        expect(negotiateLocale("fr", ["en", "de"], "en")).toBe("en");
    });

    it("messages", async () =>
    {
        const folder = new URL("../fixtures/messages/", import.meta.url);
        await Promise.all(["en", "de"].map(async (name) =>
        {
            const catalog = JSON.parse(await readFile(new URL(`${name}.json`, folder), "utf8")) as Record<string, string>;
            expect(compileMessages(name, catalog, { language: "ts", source: `${name}.json` }).code).toBe(await readFile(new URL(`${name}.ts`, folder), "utf8"));
        }));
        expect(compileIndex(["en", "de"], { language: "ts" })).toBe(await readFile(new URL("index.ts", folder), "utf8"));
        // #region use
        const saved = Date.UTC(2026, 9, 28, 9, 30);

        console.log(notesCount({ count: 0 }));        // "No notes yet"
        console.log(notesCount({ count: 1 }));        // "One note"
        console.log(notesCount({ count: 12 }));       // "12 notes"
        console.log(savedAt({ when: saved }));        // "Saved Oct 28, 2026, 09:30"
        console.log(welcome({ name: "Ada" }));        // "Welcome back, Ada!"
        // #endregion use
        expect(printed).toEqual([["No notes yet"], ["One note"], ["12 notes"], ["Saved Oct 28, 2026, 09:30"], ["Welcome back, Ada!"]]);
    });

    it("load", async () =>
    {
        vi.stubGlobal("navigator", { languages: ["de-AT", "de", "en"] });
        // #region load
        const locale = createLocale({ supported: locales, initial: navigator.languages });
        const messages = resource({
            params: () => locale.locale.get(),
            loader: async ({ params }) => loaders[params]?.()
        });
        const heading = computed(() => messages.get()?.notesCount({ count: 3 }) ?? "");
        // Once de.ts has loaded, heading.get() is "3 Notizen".
        // #endregion load
        await vi.waitFor(() => expect(heading.get()).toBe("3 Notizen"));
        // #region load

        locale.set("en");                       // loads en.ts, then heading.get() is "3 notes"
        // #endregion load
        expect(heading.get()).toBe("3 Notizen");
        await vi.waitFor(() => expect(heading.get()).toBe("3 notes"));
    });
});
