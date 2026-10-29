/**
 * @zerolith/i18n: the locale layer, built on `Intl` with nothing shipped.
 * Negotiation of the request's or the browser's languages against the
 * locales an application supports, the current locale and its direction
 * as signals, the document's `lang` and `dir`, and formatters cached per
 * locale. Message catalogs are compiled ahead of time by
 * `@zerolith/i18n/compile` into plain functions, so no message runtime
 * exists here either.
 */
import { type ReadableSignal, type Signal, computed, effect, signal } from "zerolith";

/** One entry of an `Accept-Language` header or of `navigator.languages`. */
export interface LanguageRange
{
    readonly range: string;
    readonly quality: number;
}

/** Parses an `Accept-Language` header into ranges ordered by quality, dropping those with quality zero. */
export function parseAcceptLanguage(header: string | null | undefined): LanguageRange[]
{
    if (header === null || header === undefined || header.trim() === "")
    {
        return [];
    }
    const ranges: LanguageRange[] = [];
    for (const [index, part] of header.split(",").entries())
    {
        const [rawRange = "", ...parameters] = part.split(";");
        const range = rawRange.trim();
        if (range === "")
        {
            continue;
        }
        let quality = 1;
        for (const parameter of parameters)
        {
            const [key = "", value = ""] = parameter.split("=");
            if (key.trim().toLowerCase() === "q")
            {
                const parsed = Number(value.trim());
                quality = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
            }
        }
        if (quality > 0)
        {
            ranges.push({ range, quality: quality - index * 1e-9 });
        }
    }
    return ranges.toSorted((a, b) => b.quality - a.quality).map(({ range, quality }) => ({ range, quality: Math.round(quality * 1000) / 1000 }));
}

function canonical(tag: string): string
{
    try
    {
        return Intl.getCanonicalLocales(tag)[0] ?? tag;
    }
    catch
    {
        return tag;
    }
}

/**
 * Picks the supported locale that best matches what was requested: an
 * `Accept-Language` header, `navigator.languages`, or one tag. Each range
 * is tried in order of quality, first as an exact match, then by dropping
 * subtags from the end as RFC 4647 lookup does, then as the language of a
 * more specific supported locale. `*` and no match at all give `fallback`.
 */
export function negotiateLocale(requested: string | readonly string[] | null | undefined, supported: readonly string[], fallback: string): string
{
    const ranges = typeof requested === "string" ? parseAcceptLanguage(requested).map((entry) => entry.range) : [...(requested ?? [])];
    const candidates = supported.map((tag) => ({ tag, lower: canonical(tag).toLowerCase() }));
    for (const range of ranges)
    {
        const wanted = canonical(range).toLowerCase();
        if (wanted === "*")
        {
            return fallback;
        }
        for (let prefix = wanted; prefix !== ""; prefix = prefix.includes("-") ? prefix.slice(0, prefix.lastIndexOf("-")) : "")
        {
            const exact = candidates.find((candidate) => candidate.lower === prefix);
            if (exact !== undefined)
            {
                return exact.tag;
            }
        }
        const language = wanted.split("-")[0] ?? wanted;
        const related = candidates.find((candidate) => candidate.lower.startsWith(`${language}-`));
        if (related !== undefined)
        {
            return related.tag;
        }
    }
    return fallback;
}

const RTL_LANGUAGES = new Set(["ar", "arc", "ckb", "dv", "fa", "he", "iw", "ks", "ku", "nqo", "pa-arab", "ps", "sd", "syr", "ug", "ur", "yi"]);

/** The writing direction of a locale, from `Intl.Locale` where the engine provides it and from the script or language otherwise. */
export function localeDirection(locale: string): "ltr" | "rtl"
{
    try
    {
        const parsed = new Intl.Locale(locale);
        const withInfo = parsed as Intl.Locale & { getTextInfo?: () => { direction: string }; textInfo?: { direction: string } };
        const info = withInfo.getTextInfo?.() ?? withInfo.textInfo;
        if (info !== undefined)
        {
            return info.direction === "rtl" ? "rtl" : "ltr";
        }
        const language = parsed.language.toLowerCase();
        const script = parsed.script?.toLowerCase();
        if (script === "arab" || script === "hebr" || script === "thaa" || script === "syrc" || script === "nkoo")
        {
            return "rtl";
        }
        return RTL_LANGUAGES.has(language) || RTL_LANGUAGES.has(`${language}-${script ?? ""}`) ? "rtl" : "ltr";
    }
    catch
    {
        return "ltr";
    }
}

/** Options for `createLocale`. */
export interface LocaleOptions
{
    /** The locales the application ships, most preferred first. */
    supported: readonly string[];
    /** The locale used when nothing matches. Defaults to the first supported one. */
    fallback?: string;
    /** What to negotiate from at first: an `Accept-Language` header, `navigator.languages`, or a tag. Defaults to the fallback. */
    initial?: string | readonly string[] | null;
}

/** The current locale as state. */
export interface LocaleState
{
    /** The current locale, always one of `supported`. */
    readonly locale: ReadableSignal<string>;
    /** The writing direction of the current locale. */
    readonly direction: ReadableSignal<"ltr" | "rtl">;
    readonly supported: readonly string[];
    /** Switches locales after negotiating the request against `supported`. */
    set(requested: string | readonly string[]): void;
}

/** Creates the locale state for an application. */
export function createLocale(options: LocaleOptions): LocaleState
{
    const supported = [...options.supported];
    const fallback = options.fallback ?? supported[0] ?? "en";
    const locale: Signal<string> = signal(negotiateLocale(options.initial ?? fallback, supported, fallback), { name: "locale" });
    return {
        locale,
        direction: computed(() => localeDirection(locale.get())),
        supported,
        set(requested)
        {
            locale.set(negotiateLocale(requested, supported, fallback));
        }
    };
}

/** Keeps the document's `lang` and `dir` attributes in step with the locale; returns the effect's disposer. */
export function applyLocale(state: LocaleState, doc: Document = document): () => void
{
    return effect(() =>
    {
        doc.documentElement.lang = state.locale.get();
        doc.documentElement.dir = state.direction.get();
    });
}

/** Formatters for the current locale; each reads the locale signal when called, so a computed value or template re-renders on a locale change. */
export interface Formatters
{
    number(value: number, options?: Intl.NumberFormatOptions): string;
    date(value: Date | number, options?: Intl.DateTimeFormatOptions): string;
    relative(value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): string;
    list(values: Iterable<string>, options?: Intl.ListFormatOptions): string;
    plural(value: number, options?: Intl.PluralRulesOptions): Intl.LDMLPluralRule;
}

const cache = new Map<string, unknown>();

function cached<T>(kind: string, locale: string, options: object | undefined, create: () => T): T
{
    const key = `${kind}\u0000${locale}\u0000${options === undefined ? "" : JSON.stringify(options)}`;
    let instance = cache.get(key) as T | undefined;
    if (instance === undefined)
    {
        instance = create();
        cache.set(key, instance);
    }
    return instance;
}

/** Creates formatters over a locale, given as a signal or as a fixed tag. Instances are cached per locale and options. */
export function formatters(locale: ReadableSignal<string> | string): Formatters
{
    const current = (): string => (typeof locale === "string" ? locale : locale.get());
    return {
        number: (value, options) => cached("number", current(), options, () => new Intl.NumberFormat(current(), options)).format(value),
        date: (value, options) => cached("date", current(), options, () => new Intl.DateTimeFormat(current(), options)).format(value),
        relative: (value, unit, options) => cached("relative", current(), options, () => new Intl.RelativeTimeFormat(current(), options)).format(value, unit),
        list: (values, options) => cached("list", current(), options, () => new Intl.ListFormat(current(), options)).format(values),
        plural: (value, options) => cached("plural", current(), options, () => new Intl.PluralRules(current(), options)).select(value)
    };
}
