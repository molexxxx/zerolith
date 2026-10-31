---
title: Components
description: Split the page into a row and a form, pass props, and see why a component runs once.
order: 4
---

# Components

The page now does two jobs in one function: it renders rows and it handles a form. As it grows, splitting it keeps each part readable. A component is a function, so splitting is moving code into another function.

First add a `remove` function next to `toggle` and `add`, so a row can delete its item:

@include packages/zerolith/test/fixtures/tutorial/components/src/store.ts

## A row

Create `src/components/item.ts`:

@include packages/zerolith/test/fixtures/tutorial/components/src/components/item.ts

Props are an object, and TypeScript checks them like any function's arguments. The row receives `item` as a signal, the same signal `each` hands to its row function, so the row's bindings follow the item.

The remove button has visible text and an `aria-label` that names the item, because "Remove" on its own does not say which item a screen reader user is about to remove. An attribute can mix text and bindings: `aria-label="Remove ${name}"` stays current if the name changes.

## The form

Create `src/components/add-item.ts`, with the form from the last step:

@include packages/zerolith/test/fixtures/tutorial/components/src/components/add-item.ts

## The page, from its parts

Now `src/components/packing.ts` puts the parts together:

@include packages/zerolith/test/fixtures/tutorial/components/src/components/packing.ts

A component call goes straight into a slot: `${AddItem()}`. Call the function; passing `AddItem` without calling it is reported as [`unrenderable_value`](https://molexxxx.github.io/zerolith/e/unrenderable_value/), since a function is not something a page can show.

## Why components run once

Each of these functions runs one time, when its part of the page is created. `ItemRow` runs once per item, not once per change: checking an item updates the row's checkbox and nothing else. This is why it is safe to create signals and computed values at the top of a component, and why there are no rules about the order of hooks or dependency arrays to remember: there is nothing to re-run.

## What you learned

- Splitting a component is moving code into another function and calling it.
- Props are an object; a row gets its item as a signal.
- Components run once, and their bindings keep them current.
