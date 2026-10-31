---
title: Derived state and conditions
description: Count what is packed, filter the rows, and show a note with when the filter leaves nothing.
order: 5
---

# Derived state and conditions

Two questions come up while packing: how much is left, and what exactly is left. Both answers are derived from the items, so they are computed values rather than more state to keep in sync.

## Derived values

Update `src/store.ts`:

@include packages/zerolith/test/fixtures/tutorial/derived/src/store.ts

`filter` is new state: which items to show. `packedCount` and `shown` are derived: they read `items` and `filter` and recompute when either changes. Nothing ever sets them directly, so they can never disagree with the items.

A computed value is lazy and cached. It recomputes only when something it read has changed and something reads it again, so `shown` costs nothing while no page shows it.

## The filter buttons

Create `src/components/filters.ts`:

@include packages/zerolith/test/fixtures/tutorial/derived/src/components/filters.ts

The three buttons come from an array with `map`, since the choices are fixed; `each` is for lists that change. `aria-pressed` tells assistive technology which button is on, and the computed value keeps it current: `true` and `false` become the attribute's text.

## Conditions

Update `src/components/packing.ts`:

@include packages/zerolith/test/fixtures/tutorial/derived/src/components/packing.ts

`each` now renders `shown` instead of `items`, so the rows follow the filter. `when` renders its view while the condition is true and removes it when the condition turns false; an optional third argument renders while it is false. Here it shows a note when the filter leaves no rows, such as choosing Left to pack once everything is packed.

## What you learned

- Derived values are computed, never set, so they cannot drift from their sources.
- Computed values are lazy and cached.
- `when` shows a view while a condition holds; `each` is for lists that change, `map` for fixed ones.
