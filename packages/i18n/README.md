# @zerolith/i18n

Internationalization for zerolith, built on `Intl` with nothing shipped: the engine already knows how to format numbers, dates, lists, and plurals for every locale, so the package only decides which locale, keeps it as a signal, and compiles message catalogs into plain functions ahead of time.

```ts
import { applyLocale, createLocale, formatters } from "@zerolith/i18n";

const locale = createLocale({ supported: ["en", "de", "ar"], initial: navigator.languages });
applyLocale(locale);                        // <html lang dir> follow the signal
const format = formatters(locale.locale);
format.number(1234.5, { style: "currency", currency: "EUR" });
```

- `negotiateLocale` and `parseAcceptLanguage` pick the best supported locale for an `Accept-Language` header, `navigator.languages`, or one tag, the way RFC 4647 lookup does.
- `createLocale` holds the current locale and its direction as signals; `applyLocale` writes them to the document.
- `formatters` wraps `Intl.NumberFormat`, `DateTimeFormat`, `RelativeTimeFormat`, `ListFormat`, and `PluralRules`, cached per locale and options, reading the locale signal when called.
- `zerolith-i18n` compiles MessageFormat 2 catalogs (`messages/en.json`) into one module per locale, with a function per message and typed arguments, so a locale is one chunk and no message runtime is loaded.

The guide is on the [docs site](https://molexxxx.github.io/zerolith/guide/i18n/).

Status: alpha. Install with `npm install @zerolith/i18n@alpha`; the API may change before 1.0.

## License

Apache-2.0. See `LICENSE`.
