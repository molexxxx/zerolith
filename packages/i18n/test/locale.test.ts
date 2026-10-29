import { describe, expect, it } from "vitest";
import { computed } from "zerolith";
import { createLocale, formatters, localeDirection, negotiateLocale, parseAcceptLanguage } from "@zerolith/i18n";

describe("parseAcceptLanguage", () =>
{
    it("orders ranges by quality, keeps header order for ties, and drops zero", () =>
    {
        expect(parseAcceptLanguage("en-US,en;q=0.9,de;q=0.8,fr;q=0")).toEqual([
            { range: "en-US", quality: 1 },
            { range: "en", quality: 0.9 },
            { range: "de", quality: 0.8 }
        ]);
        expect(parseAcceptLanguage("de;q=0.5, fr, *;q=0.1").map((entry) => entry.range)).toEqual(["fr", "de", "*"]);
        expect(parseAcceptLanguage(null)).toEqual([]);
        expect(parseAcceptLanguage(" ")).toEqual([]);
    });
});

describe("negotiateLocale", () =>
{
    const supported = ["en", "de-CH", "pt-BR", "zh-Hant"];

    it("matches exactly, then by dropping subtags, then by language", () =>
    {
        expect(negotiateLocale("de-ch", supported, "en")).toBe("de-CH");
        expect(negotiateLocale("en-GB", supported, "de-CH")).toBe("en");
        expect(negotiateLocale("pt", supported, "en")).toBe("pt-BR");
        expect(negotiateLocale("zh-TW", supported, "en")).toBe("zh-Hant");
        expect(negotiateLocale(["fr-CA", "pt-PT"], supported, "en")).toBe("pt-BR");
    });

    it("honors header order and quality and falls back", () =>
    {
        expect(negotiateLocale("fr;q=0.9,de;q=0.8", supported, "en")).toBe("de-CH");
        expect(negotiateLocale("*", supported, "en")).toBe("en");
        expect(negotiateLocale("ja", supported, "en")).toBe("en");
        expect(negotiateLocale(null, supported, "en")).toBe("en");
        expect(negotiateLocale("!!", supported, "en")).toBe("en");
    });
});

describe("localeDirection", () =>
{
    it("tells right-to-left locales from the rest", () =>
    {
        expect(localeDirection("en-US")).toBe("ltr");
        expect(localeDirection("ar")).toBe("rtl");
        expect(localeDirection("he-IL")).toBe("rtl");
        expect(localeDirection("fa")).toBe("rtl");
        expect(localeDirection("ur-Arab")).toBe("rtl");
        expect(localeDirection("nonsense tag")).toBe("ltr");
    });
});

describe("createLocale and formatters", () =>
{
    it("negotiates the initial locale, switches within the supported set, and formats for the current one", () =>
    {
        const state = createLocale({ supported: ["en", "de", "ar"], initial: "de-AT,en;q=0.5" });
        expect(state.locale.get()).toBe("de");
        expect(state.direction.get()).toBe("ltr");
        const format = formatters(state.locale);
        const price = computed(() => format.number(1234.5, { style: "currency", currency: "EUR" }));
        expect(price.get()).toBe("1.234,50 €");
        expect(format.plural(1)).toBe("one");

        state.set(["ar-EG"]);
        expect(state.locale.get()).toBe("ar");
        expect(state.direction.get()).toBe("rtl");
        expect(price.get()).not.toBe("1.234,50 €");

        state.set("xx");
        expect(state.locale.get()).toBe("en");
        expect(format.list(["a", "b", "c"])).toBe("a, b, and c");
        expect(format.relative(-1, "day", { numeric: "auto" })).toBe("yesterday");
        expect(format.date(Date.UTC(2026, 9, 28), { dateStyle: "medium", timeZone: "UTC" })).toBe("Oct 28, 2026");
    });
});
