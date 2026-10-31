---
title: State and lists
description: Hold the items in a signal, render one row per item with each, and learn the one rule that keeps a page live.
order: 2
---

# State and lists

The list needs items, and the items will change: you will add some, check some off, and remove some. In zerolith, a value that changes over time lives in a signal.

## A signal for the items

Create `src/store.ts`, a module for the list's state:

@include packages/zerolith/test/fixtures/tutorial/state/src/store.ts

`signal` takes the starting value and returns an object with two methods: `get()` reads the value, and `set()` replaces it. State that more than one component reads lives in `src/store.ts`, the place every zerolith project keeps it, so any component can import it and it outlives a page that is closed and opened again.

The second argument names the signal. A named signal keeps its value when you save a file: `zerolith dev` reloads the page and restores every named signal, so the list you were testing with is still there after an edit.

## One row per item

Now render the items. Replace `src/components/packing.ts`:

@include packages/zerolith/test/fixtures/tutorial/state/src/components/packing.ts

Three things are new here.

`computed` makes a value that follows other signals. `count` reads `items`, so whenever `items` changes, `count` recomputes, and only then.

`each` renders a list. It takes the signal holding the array, a key function that says which item is which, and a function that renders one row. When the array changes, `each` compares keys: a row whose item is still there keeps its element, a new key gets a new row, and a missing key loses its row. Nothing else is touched, so a focused checkbox or a half-typed field in a row survives the update.

The row function receives the item as a signal, not as a plain object, so that `computed(() => item.get().name)` can follow the item if its name changes later while the row stays in place.

## The one rule

Look at how the template uses `count`: it puts the signal itself in the slot, `${count}`, not `${count.get()}`. This is the rule to learn first, and it is the only one:

**Bind the signal, not its value.**

`${count}` hands the template the signal, and the template keeps the text up to date for as long as the page is open. `${count.get()}` reads the number once, while the template is being made, and the page never changes again. Both are valid code, so the runtime cannot warn you; `zerolith doctor` and the Vite plugin report a frozen read like that before the code runs, under the code [`template_frozen_read`](/e/template_frozen_read/).

There is no re-rendering in zerolith. `Packing()` runs once, when the page opens. After that, a change to `items` updates exactly the text nodes and rows that depend on it. If you come from React, this is the biggest difference: the function is not called again, so it is a fine place to create signals and computed values.

## What you learned

- A signal holds a value that changes: `get()` reads it, `set()` replaces it.
- `computed` derives a value from other signals and follows them.
- `each` renders keyed rows and keeps each row's element while its key stays.
- Bind the signal, not its value, and the page stays live.
