---
title: Dates for the reader
description: Write each release's date the way the reader's language writes dates, with the formatters of @zerolith/i18n, on the right day in every time zone.
order: 4
---

# Dates for the reader

The file writes dates as `2026-10-20`, which is easy for a computer to read. People write that day differently depending on where they live:

- October 20, 2026 in the United States
- 20 October 2026 in Britain
- 20. Oktober 2026 in Germany

The browser already knows how every language writes dates, through a built-in feature called `Intl`. The page just has to ask in the reader's language.

`@zerolith/i18n` is zerolith's package for languages. Install it:

```sh
npm install @zerolith/i18n
```

It doesn't carry any language data of its own. It uses what the browser already has.

## A date for the reader

Create `src/dates.ts`:

@include packages/zerolith/test/fixtures/release-notes/dates/src/dates.ts

- **`navigator.language`** is the reader's preferred language, such as `en-US` or `de-DE`.
- **`formatters`** gives you the browser's date and number formatters for that language. It reuses each one it makes, so the seven rows share a formatter instead of making seven.
- **`dateStyle: "long"`** writes the month as a word, in that language's order.
- **`timeZone: "UTC"`** keeps the day right everywhere.

Here's why the time zone matters. `Date.parse("2026-10-20")` means midnight at the start of that day in UTC. A date is normally shown in the reader's own time zone. A reader in New York is four or five hours behind UTC, depending on the season, so without this option they'd see October 19. A release date is a day on the calendar, not a moment in time, so showing it in UTC gives every reader the day the file says.

> [!NOTE]
> An app with more than one language keeps the reader's choice in a signal made by `createLocale`, and passes it to `formatters` instead of a fixed language. Then every date changes when the reader picks another language. The [internationalization guide](../../guide/i18n.md) covers it, along with translated messages.

## Dates on the pages

Update `src/components/release-row.ts`:

@include packages/zerolith/test/fixtures/release-notes/dates/src/components/release-row.ts

And `src/components/release.ts`:

@include packages/zerolith/test/fixtures/release-notes/dates/src/components/release.ts

`<time datetime="2026-10-20">` keeps the file's date next to the one written for people. Browsers, search engines, and other tools can read it. The release page only works out `date` once the release is found, because a release that hasn't loaded has no date yet.

## Try it

The list now shows dates like "October 20, 2026". To see another language, put German first in your browser's language settings and reload. The list reads "20. Oktober 2026".

## What you learned

- The browser's `Intl` writes dates in every language. `formatters` from `@zerolith/i18n` wraps it and reuses each formatter.
- `navigator.language` is the reader's preferred language.
- Show a calendar day in UTC, so it's the same day in every time zone.
- `<time datetime>` keeps a date that tools can read in the page.
