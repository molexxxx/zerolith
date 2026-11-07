---
title: Search in the URL
description: Keep the search in the URL, so it survives a reload, comes back with the back button, and can be shared as a link.
order: 6
---

# Search in the URL

Reload the page and your search is gone, because it only lives in the page. A search worth keeping belongs in the address, where the browser keeps the rest of your place.

With the search in the address, `/releases?q=photo` opens the list already searched for "photo":

- after a reload
- from a bookmark
- from a link someone sent you
- when the back button returns from a release

## The address holds the search

Update `src/components/releases.ts`:

@include packages/zerolith/test/fixtures/release-notes/app/src/components/releases.ts

**`query` now starts from the address.** `router.url` is a signal of the page's address, and `searchIn` reads `q` from it. That one line covers every way to reach the page. A reload, a link, and the back button each open the page at an address, so none of them needs code of its own.

**The effect writes the address.** It runs when `settled` changes, once you pause typing. `keepInAddress` sets `q` to the search, or removes it when the search is empty. If the address already holds the search, as it does when the page has just opened, it leaves it alone.

`searchParams` writes the search the way addresses write text. A space becomes `+` and `&` becomes `%26`, and it reads them back the same way, so any text survives the trip.

## Keeping the page

`router.navigate` gets two options here:

- **`shallow: true`** keeps the page on the screen. Normally, an address with a different `?q=` counts as a different page, and the router builds it again. That would replace the field you're typing in and take away your cursor. A shallow change only updates the address and `router.url`. The field stays, with your cursor in it, and the page doesn't scroll.
- **`replace: true`** replaces the current history entry instead of adding a new one. The back button then goes to the page before the list, not through every search you typed.

## Try it

1. Search for `photo`. The address reads `/releases?q=photo`, and your cursor stays in the field.
2. Reload. The search and its two releases are still there.
3. Open one of them and press the back button. The list comes back with the search.
4. Click **Releases** in the header. The search clears, and every release is back.
5. Press the back button. The search returns.

## What you learned

- `router.url` is a signal of the address, so a page can start from what the address holds.
- `navigate` with `shallow: true` changes the query without building the page again. `replace: true` changes it without adding a history entry.
- When the page starts from the address, links, reloads, and the back button work without extra code.
