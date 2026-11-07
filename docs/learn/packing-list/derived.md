---
title: Derived state
description: Count what is packed, filter the rows, and show a note when the filter leaves nothing.
order: 5
---

# Derived state

While you pack, you want to know two things: how many items are packed, and what's left. Both answers come from the items you already have. So instead of storing them, you'll compute them.

## Derived values

Update `src/store.ts`:

@include packages/zerolith/test/fixtures/tutorial/derived/src/store.ts

- **`filter`** is new state. It says which items to show: all of them, the ones left to pack, or the packed ones.
- **`packedCount`** counts the packed items.
- **`shown`** is the list of items the filter lets through.

`packedCount` and `shown` are **derived**: they're computed from `items` and `filter`, and they update when either one changes. Nothing ever sets them directly, so they always match the items.

A computed value only does work when someone reads it and something it uses has changed. If no page shows `shown`, it costs nothing.

Two details in the store:

- When **Left to pack** is selected, checking an item takes its row off the list. That's why the row's checkbox already uses `keepingFocus`.
- `add` sets the filter to **All** when **Packed** is selected, so a new item shows as soon as you add it.

## The filter buttons

Create `src/components/filters.ts`:

@include packages/zerolith/test/fixtures/tutorial/derived/src/components/filters.ts

The buttons come from a fixed array, so `map` makes them. Use `each` for lists that change, and `map` for lists that don't.

`aria-pressed` tells screen readers which button is on. It's a computed value, so it switches between `true` and `false` as you click.

## Conditions

Update `src/components/packing.ts`:

@include packages/zerolith/test/fixtures/tutorial/derived/src/components/packing.ts

The rows now come from `shown` instead of `items`, so they follow the filter.

`when` shows something only while a condition is true. Here it shows "Nothing to show here." when the filter leaves no rows, such as choosing **Left to pack** after everything is packed. You can pass a third argument to show something else while the condition is false.

> [!NOTE]
> `when` is zerolith's if and else, like `? :` in React or `@if` and `@else` in Angular. Its condition must be a signal, which is why `empty` is a computed value. If you pass a function by mistake, your editor marks it as an error.

## Try it

The page now shows how many items are packed, like "1 of 3 packed". Click **Left to pack**, then **Packed**, then **All**. The list changes each time. Pack everything, then click **Left to pack** to see the empty note.

## What you learned

- Compute values from your state instead of storing them, so they can't get out of sync.
- A computed value only does work when it's read and something it uses has changed.
- `when` shows something while a condition is true. Use `each` for lists that change and `map` for fixed ones.
