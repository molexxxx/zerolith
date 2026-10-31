---
title: Events and updates
description: Listen to clicks and form submits with @ bindings, and change state by setting a new array.
order: 3
---

# Events and updates

A packing list you cannot check off is a poster. This step adds the two things you do with the list: mark an item packed, and add a new one.

## Changing the state

Add two functions to `src/store.ts`:

@include packages/zerolith/test/fixtures/tutorial/events/src/store.ts

Both functions build a new array and set it, rather than changing the old array in place. A signal notices `set()`, and it compares the new value with the old one: the same array, even with a changed item inside, looks like no change at all. Setting a new array is what tells the page something happened, and `each` then works out which rows actually differ by their keys.

`toggle` copies only the item that changes; every other item keeps its object, so its row sees no change. `add` picks the next free id, one more than the largest so far.

## Listening to events

Update `src/components/packing.ts`:

@include packages/zerolith/test/fixtures/tutorial/events/src/components/packing.ts

An attribute that starts with `@` listens to an event: `@change` on the checkbox, `@submit` on the form. The value is the function to call. Two more binding forms appear here:

- `.checked=${...}` with a leading dot sets a property on the element instead of an attribute, which is what a checkbox's checked state needs.
- A plain attribute, like `name="name"`, is static markup.

The form is a real form: it has a label, a required field, and a submit button, so it works with the keyboard and with assistive technology, and pressing Enter submits it. The handler stops the browser's own submission, reads the field through `FormData`, and clears the form after adding.

## What you learned

- `@event=${handler}` listens to an event; `.property=${value}` sets a property.
- State changes by setting a new value; a signal ignores a value that is the same as the old one.
- Native forms and labels give you keyboard and screen reader support for free.
