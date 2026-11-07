---
title: Search as you type
description: Narrow the list with a search field that waits for a pause in typing, matches every word, and announces how many releases it found.
order: 5
---

# Search as you type

Seven releases are easy to scan; seventy are not. A search field narrows the list to the releases that mention what you type. Filtering on every keystroke would redraw the list for each letter, and a screen reader would announce a new count for each one, so the search waits until you pause.

Waiting for a pause is a debounced signal, and `@zerolith/state` has one. Install it:

```sh
npm install @zerolith/state
```

It depends on `zerolith` alone.

## The search

Update `src/components/releases.ts`:

@include packages/zerolith/test/fixtures/release-notes/search/src/components/releases.ts

`query` holds what the field holds, and `typed` sets it on every `input` event. `.value=${query}` binds the field's value to the signal, so the two always agree.

`debounced(query, 300)` is a signal that follows `query` once `query` has stayed the same for 300 milliseconds. While you type, `settled` keeps the last search; when you stop, it takes what you typed. Everything that filters reads `settled`, so the list changes once per pause.

`wordsOf` splits the search into words in lower case, and `mentions` keeps a release only when every word appears somewhere in its version, summary, or notes, in any case. `photo` finds two releases, `photo import` only the one that mentions both, and `2.2` finds both releases whose version starts with it. An empty search has no words, so every release matches.

`summary` says how many releases matched, in a second `role="status"` paragraph, so a screen reader hears the count after each pause. It stays empty while there is no search, and while the releases load, when there is nothing to count yet. A count that does not change from one search to the next is not announced again.

`<search>` marks the part of the page that searches, which assistive technology lists with the page's other landmarks. The label wraps the field, as the packing list's form does, so the field has a name.

The `css` rule gives the field some room under the heading, scoped to this page, as the packing list's [styles step](../packing-list/styles.md) explains.

`typed` sits inside `Releases` because it sets `query`, which belongs to the page. `wordsOf`, `mentions`, and `found` use nothing from the page, so they sit at the top of the module, where the starter's lint rule expects them.

Type `photo` and pause, and two releases are left. Type `2.2`, then clear the field.

## What you learned

- `debounced(source, ms)` follows a signal once it has been quiet for `ms` milliseconds.
- Filtering reads the debounced signal, so the list changes once per pause in typing.
- A status region announces a search's count after each pause.
- `<search>` and a label make the field a named landmark.
