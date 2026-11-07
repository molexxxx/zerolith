---
title: State and lists
description: Hold the items in a signal, render one row per item with each, and learn the one rule that keeps a page live.
order: 2
---

# State and lists

Your list's items will change. You'll add some, check some off, and remove some. In zerolith, a value that changes lives in a **signal**. When a signal changes, the parts of the page that show it update by themselves.

## A signal for the items

Create `src/store.ts`. This file holds the app's state, so any component can use it:

@include packages/zerolith/test/fixtures/tutorial/state/src/store.ts

`signal` takes a starting value. It gives you back an object with two methods:

- `items.get()` reads the current value.
- `items.set(newValue)` replaces it.

`{ name: "items" }` gives the signal a name. While `npm run dev` runs, saving a file reloads the page but keeps the value of every named signal. Your test items are still there after each edit.

## One row per item

Now show the items. Replace `src/components/packing.ts` with this:

@include packages/zerolith/test/fixtures/tutorial/state/src/components/packing.ts

Three things are new.

**`computed`** makes a value from other signals. `count` reads `items`, so `count` updates whenever `items` changes.

**`each`** shows one row for each item in a list. It takes three things:

1. The signal that holds the list, `items`.
2. A function that returns each item's key, here its `id`. The key is how zerolith tells items apart.
3. A function that returns the row for one item.

When the list changes, `each` only adds the rows for new keys and removes the rows for keys that are gone. Every other row stays as it is, so a checkbox you just clicked keeps its focus.

**The row gets the item as a signal.** That's why the row reads the name with `computed(() => item.get().name)`. If the item's name changes later, the row shows the new name.

> [!NOTE]
> `each` works like `items.map()` with a `key` in React, or `@for` with `track` in Angular. The [templates guide](../../guide/templates.md#coming-from-react-or-angular) compares more of them.

## The one rule

Look at how the page uses `count`. It writes `${count}`, not `${count.get()}`.

> [!IMPORTANT]
> **Put the signal in the template, not its value.** `${count}` gives the template the signal, so the number on the page stays up to date. `${count.get()}` reads the number once, and the page never changes again.

Both versions run without an error, so it's an easy mistake to make. `npx zerolith doctor` finds it for you. It reports `template_frozen_read` and points to the line.

Your `Packing()` function runs only once, when the page opens. After that, zerolith updates just the text and the rows that depend on a signal that changed.

> [!NOTE]
> Coming from React? This is the biggest difference. The function doesn't run again, so it's a safe place to create signals and computed values.

## Try it

Save the files and open the Packing page. You'll see "Items: 3" and the three items.

## What you learned

- A signal holds a value that changes. `get()` reads it and `set()` replaces it.
- `computed` makes a value from other signals and keeps it up to date.
- `each` shows one row per item and keeps each row while its item stays.
- Put the signal in the template, not its value, and the page stays up to date.
