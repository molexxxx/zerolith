---
title: Dates for the reader
description: Write each release's date the way the reader's language writes dates, with the formatters of @zerolith/i18n, on the right day in every time zone.
order: 4
---

# Dates for the reader

The file writes dates as `2026-10-20`, which suits a machine. People write the same day as October 20, 2026 in the United States, 20 October 2026 in Britain, and 20. Oktober 2026 in Germany. The browser already knows how every language writes dates, through `Intl`, so the page only has to ask it in the reader's language.

`@zerolith/i18n` is zerolith's package for languages. Install it:

```sh
npm install @zerolith/i18n
```

It depends on `zerolith` alone, and ships no language data of its own: it uses what the browser has.

## A date for the reader

Create `src/dates.ts`:

@include packages/zerolith/test/fixtures/release-notes/dates/src/dates.ts

`navigator.language` is the language the reader's browser asks for first, such as `en-US` or `de-DE`. `formatters` wraps the browser's `Intl` formatters for that language, and keeps each formatter it builds, so the seven rows of the list share one rather than building seven. `dateStyle: "long"` asks for the month written out, in the order and words of the language.

`timeZone: "UTC"` keeps the day right. `Date.parse("2026-10-20")` is midnight at the start of that day in UTC, and a date is written in the reader's own time zone unless told otherwise, so a reader in New York, five hours behind, would see October 19. A release date is a day on the calendar, not a moment in time, so writing it in UTC gives every reader the day the file says.

> [!NOTE]
> An app that speaks more than one language keeps the reader's choice in a locale signal from `createLocale`, and passes that signal to `formatters` instead of a fixed language, so every date follows a change of language. The [internationalization guide](../../guide/i18n.md) covers it, with messages in each language.

## Dates on the pages

Update `src/components/release-row.ts`:

@include packages/zerolith/test/fixtures/release-notes/dates/src/components/release-row.ts

And `src/components/release.ts`:

@include packages/zerolith/test/fixtures/release-notes/dates/src/components/release.ts

`<time datetime="2026-10-20">` keeps the date the file gave beside the one written for people, for browsers, search engines, and other tools that read the page. The page computes `date` only once the release is found, since a release that has not loaded has no date to write.

To see another language, put German first in your browser's language settings and reload: the list reads 20. Oktober 2026.

## What you learned

- The browser's `Intl` writes dates in every language, and `formatters` from `@zerolith/i18n` wraps it and reuses each formatter.
- `navigator.language` is the reader's first language.
- A calendar day is written in UTC, so it is the same day in every time zone.
- `<time datetime>` keeps the machine-readable date in the page.
