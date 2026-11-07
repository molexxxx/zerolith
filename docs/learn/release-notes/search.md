---
title: Search as you type
description: Narrow the list with a search field that waits for a pause in typing, matches every word, and announces how many releases it found.
order: 5
---

# Search as you type

Seven releases are easy to scan. Seventy aren't. A search field narrows the list to the releases that mention what you type.

Filtering on every key press would redraw the list for each letter, and a screen reader would read out a new count each time. So the search waits until you pause. A signal that waits for a pause is called **debounced**, and `@zerolith/state` has one. Install it:

```sh
npm install @zerolith/state
```

## The search

Update `src/components/releases.ts`:

@include packages/zerolith/test/fixtures/release-notes/search/src/components/releases.ts

**`query`** holds what's in the field. `typed` sets it each time you type. `.value=${query}` ties the field to the signal, so they always match.

**`debounced(query, 300)`** follows `query`, but only after `query` has stayed the same for 300 milliseconds. While you type, `settled` keeps the last search. When you stop, it takes what you typed. Everything that filters reads `settled`, so the list changes once per pause.

**`wordsOf`** splits the search into lowercase words. **`mentions`** keeps a release only if every word appears somewhere in its version, summary, or notes, in any case. For example:

- `photo` finds two releases.
- `photo import` finds only the one that mentions both words.
- `2.2` finds both releases whose version starts with it.
- An empty search has no words, so every release matches.

**`summary`** says how many releases matched, in a second `role="status"` paragraph, so a screen reader reads the count after each pause. It stays empty when there's no search, and while the releases are loading. If the count doesn't change from one search to the next, it isn't read again.

**`<search>`** marks this part of the page as a search area. Screen readers list it with the page's other main areas. The label wraps the field, so the field has a name.

The `css` rule adds some space between the heading and the field, only on this page, as the packing list's [styles step](../packing-list/styles.md) explains.

`typed` sits inside `Releases`, because it changes `query`, which belongs to the page. `wordsOf`, `mentions`, and `found` don't use anything from the page, so they sit at the top of the file, where the starter's linter expects them.

## Try it

1. Type `photo` and pause. Two releases are left.
2. Type `2.2` instead. The list changes to the 2.2 releases.
3. Clear the field. Every release is back.

## What you learned

- `debounced(source, ms)` follows a signal once it has stayed the same for `ms` milliseconds.
- Filter from the debounced signal, so the list changes once per pause in typing.
- A `role="status"` paragraph reads out the count after each pause.
- `<search>` and a label give the search field a name that screen readers can find.
