---
title: Search in the URL
description: Keep the search in the URL, so it survives a reload, comes back with the back button, and can be shared as a link.
order: 6
---

# Search in the URL

Reload the page and the search is gone, since it lives only in the page. A search worth keeping belongs where the browser keeps the rest of the page's place: in the address. `/releases?q=photo` opens the list already searched for `photo`, after a reload, from a bookmark, from a link someone sent you, and when the back button returns from a release.

## The address holds the search

Update `src/components/releases.ts`:

@include packages/zerolith/test/fixtures/release-notes/app/src/components/releases.ts

`query` now starts from the address: `router.url` is a signal of the page's address, and `searchIn` reads `q` from it. That one line covers every way onto the page. A reload, a link, and the back button each build the page from the address they arrive at, so they need no code of their own.

The effect writes the address. It runs when `settled` changes, once you pause, and `keepInAddress` sets `q`, or removes it when the search is empty. It leaves the address alone when it already holds the search, as it does when the page has just opened. `searchParams` writes the search the way addresses write text, a space as `+` and an `&` as `%26`, and reads it back, so any text survives the trip.

## Keeping the page

`router.navigate` gets two options here.

`shallow: true` keeps the page on the screen. An address with a different query string is normally a different page, which the router loads and renders again, and that would replace the field you are typing in and take the keyboard focus with it. A shallow navigation to the page's own path changes only the address and `router.url`, so the field stays, with your cursor in it, and the page stays where it is scrolled.

`replace: true` replaces the current history entry rather than adding one, so the back button goes to the page before the list, not through every search you typed.

Search for `photo`, and the address reads `/releases?q=photo` with the cursor still in the field. Reload, and the search and its two releases are still there. Open one of them and press the back button: the list comes back searched. Click Releases in the header: the address loses the search, the field clears, and every release is back. The back button returns the search.

## What you learned

- `router.url` is a signal of the address, so a page can start from what the address holds.
- `navigate` with `shallow: true` changes the query without building the page again, and `replace: true` changes it without adding a history entry.
- With the page built from the address, links, reloads, and the back button work with no code of their own.
