---
title: Events and updates
description: Listen to clicks and form submits with @ bindings, and change state by setting a new array.
order: 3
---

# Events and updates

Right now the list only shows items. In this step you'll make it do two things: check an item off, and add a new one.

## Changing the state

Add two functions to `src/store.ts`:

@include packages/zerolith/test/fixtures/tutorial/events/src/store.ts

- `toggle` flips one item between packed and not packed.
- `add` adds a new item. Its id is one more than the largest id so far.

Both functions make a new array and pass it to `set`. They never change the old array. Here's why: a signal only updates the page when you `set` a different value. If you change the old array in place, it's still the same array, so nothing updates.

`toggle` copies only the item that changes. Every other item stays the same object, so its row doesn't redraw.

> [!WARNING]
> `items.get().push(item)` changes the array in place and never calls `set`, so the page won't change. Always set a new array.

## Listening to events

Update `src/components/packing.ts`:

@include packages/zerolith/test/fixtures/tutorial/events/src/components/packing.ts

There are three kinds of bindings in this template:

- **`@change`** and **`@submit`** start with `@`. They listen for an event and call your function when it happens.
- **`.checked`** starts with a dot. It sets a property on the element, which is how a checkbox's checked state works.
- **`name="name"`** is a plain attribute that never changes.

The form is a normal HTML form, with a label, a required field, and a button. That means it works with the keyboard and with screen readers, and pressing Enter adds the item.

When you submit, the `submitted` function:

1. Stops the browser from reloading the page.
2. Reads the field with `FormData`.
3. Adds the item and clears the form.

`submitted` is written outside `Packing` because it doesn't use anything from inside it. It gets the form from the event. The starter's linter, `npm run lint`, asks for this. A function that does use something from inside a component stays inside it, as you'll see in the next step.

## Try it

Check an item, then uncheck it. Type a new item and press Enter. It appears at the end of the list, and the field clears.

## What you learned

- `@event=${handler}` listens for an event. `.property=${value}` sets a property.
- To change state, set a new value. A signal ignores a value that's the same as before.
- Normal HTML forms and labels work with the keyboard and screen readers without extra code.
