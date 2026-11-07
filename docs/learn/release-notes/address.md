---
title: The search in the address
description: Keep the search in the URL, so it survives a reload, comes back with the back button, and can be shared as a link.
order: 6
---

# The search in the address

Reload the page and the search is gone, since it lives only in the page. A search worth keeping belongs where the browser keeps the rest of the page's place: in the address. `/releases#q=photo` opens the list already searched for `photo`, after a reload, from a bookmark, from a link someone sent you, and when the back button returns from a release.

## Why the hash

The usual place for a search is the query string, as in `/releases?q=photo`. The router treats an address with a different query string as a different page and renders it again, which would replace the field you are typing in and take the keyboard focus with it.

An address that differs only in its hash, the part after `#`, is the same page to the router. `router.navigate` updates the address and `router.url`, and leaves the page as it is, so the field stays, with your cursor in it. The browser does not send the hash to the server, and since this search runs in the page, the server has no use for it.

## The address holds the search

Update `src/components/releases.ts`:

@include packages/zerolith/test/fixtures/release-notes/app/src/components/releases.ts

`router.url` is a signal of the page's address, so `asked`, the search in the address, follows it. The list now reads its words from `asked`, which gives the search one direction: the field writes to the address, and the list reads from the address. Anything else that changes the address changes the list the same way, so a link, a reload, and the back button need no code of their own.

`query` still holds what the field holds. The first effect sets it to the search in the address, once when the page opens and again whenever the address changes, so the field shows the search the page opened with, and clears when a link takes the search away. `debounced` starts at its source's value, and it is created after that effect, so a page that opens on a search has no pause to wait for.

The second effect writes the address once you pause. It reads both signals, and `settled` equal to `query` means the field has been quiet: while you type, the two differ and nothing is written. Waiting for `settled` to change would not do, since it can already hold what you type: when a link clears a search and you type the same search again at once, `settled` never left it, and the address would stay empty.

`keepInAddress` leaves the address alone when it already holds the search, as it does when the page has just opened. Otherwise it puts the search after `#q=`, or removes the hash when the search is empty, and calls `router.navigate` with `replace: true`, which replaces the current history entry rather than adding one, so the back button goes to the page before the list, not through every search you typed. `navigate` also moves the page to its top, where the field is. `URLSearchParams` writes the search the way addresses write text, a space as `+` and an `&` as `%26`, and reads it back, so any text survives the trip.

Search for `photo`, and the address reads `/releases#q=photo` with the cursor still in the field. Reload, and the search and its two releases are still there. Open one of them and press the back button: the list comes back searched. Click Releases in the header: the address loses the search, the field clears, and every release is back. The back button returns the search.

## What you learned

- `router.url` is a signal of the address, so a page can read its state from there.
- The router keeps a page in place when only the hash changes, and renders it again when the query string changes.
- `navigate` with `replace: true` changes the address without adding a history entry.
- With the address as the one place for the search, links, reloads, and the back button work with no code of their own.
