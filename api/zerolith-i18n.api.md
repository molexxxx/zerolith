# @zerolith/i18n

Every export of `@zerolith/i18n` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function applyLocale(state: LocaleState, doc?: Document): () => void
function createLocale(options: LocaleOptions): LocaleState
function formatters(locale: ReadableSignal<string> | string): Formatters
function localeDirection(locale: string): "ltr" | "rtl"
function negotiateLocale(requested: string | readonly string[] | null | undefined, supported: readonly string[], fallback: string): string
function parseAcceptLanguage(header: string | null | undefined): LanguageRange[]

interface Formatters
{
    number(value: number, options?: Intl.NumberFormatOptions): string
    date(value: Date | number, options?: Intl.DateTimeFormatOptions): string
    relative(value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): string
    list(values: Iterable<string>, options?: Intl.ListFormatOptions): string
    plural(value: number, options?: Intl.PluralRulesOptions): Intl.LDMLPluralRule
}

interface LanguageRange
{
    readonly range: string
    readonly quality: number
}

interface LocaleOptions
{
    supported: readonly string[]
    fallback?: string
    initial?: string | readonly string[] | null
}

interface LocaleState
{
    readonly locale: ReadableSignal<string>
    readonly direction: ReadableSignal<"ltr" | "rtl">
    readonly supported: readonly string[]
    set(requested: string | readonly string[]): void
}
```
