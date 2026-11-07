---
title: Components
description: Split the page into a row and a form, pass props, and see why a component runs once.
order: 4
---

# Components

The page function now shows the rows and handles the form. As it grows, it gets harder to read. Since a component is just a function, you can split it by moving code into other functions.

First, add a `remove` function next to `toggle` and `add`, so each row can delete its item:

@include packages/zerolith/test/fixtures/tutorial/components/src/store.ts

## A row

Create `src/components/item.ts`:

@include packages/zerolith/test/fixtures/tutorial/components/src/components/item.ts

A component's inputs are called **props**. They're one object, and TypeScript checks them like any function's arguments. The row gets `item` as a signal, the same one `each` passes in, so the row stays up to date when the item changes.

The Remove button shows the word "Remove". It also has an `aria-label` with the item's name, such as "Remove Passport". A screen reader reads that label, so its user knows which item the button removes. The label can mix text and values, and it updates if the name changes.

When you remove a row, the button you pressed goes away with it. `keepingFocus` moves the keyboard focus somewhere useful instead:

1. To the next row's checkbox.
2. If there's no next row, to the row before.
3. If the list is now empty, to the new item field.

`keepingFocus` returns the event handler, so each row makes `toggled` and `removed` once. The checkbox uses it too, for a reason you'll see in the next step.

## The form

Create `src/components/add-item.ts`, with the form from the last step:

@include packages/zerolith/test/fixtures/tutorial/components/src/components/add-item.ts

## The page, from its parts

Now update `src/components/packing.ts` to put the parts together:

@include packages/zerolith/test/fixtures/tutorial/components/src/components/packing.ts

You use a component by calling it inside `${}`, like `${AddItem()}`. Don't forget the parentheses. `${AddItem}` without them shows an error in the browser, `unrenderable_value`, and `npx zerolith doctor` reports it before you run the page as `template_component_uncalled`.

## Why components run once

Each of these functions runs one time, when its part of the page is first created. `ItemRow` runs once for each item, not every time something changes. Checking an item updates only that row's checkbox.

That's why you can create signals and computed values at the top of a component. There are no rules about hook order or dependency arrays, because nothing runs again.

## Try it

The page looks the same as before, with a Remove button on each row. Remove an item with the keyboard: Tab to its Remove button and press Enter. Focus moves to the next item's checkbox.

## What you learned

- To split a component, move code into another function and call it.
- Props are one object. A row gets its item as a signal.
- Components run once. Their signals keep them up to date.
