---
title: State
description: "Signals with a memory: a signal kept in storage and across tabs, undo and redo for a signal, debounced and throttled signals, and a selector that tells each row whether it is the selected one."
order: 12
group: Building apps
---

# State

A signal holds one value for one page load. The things an application wants beyond that, a preference that survives a reload and shows the same in every tab, an undo button, a search that waits for the reader to stop typing, a selected row among a thousand, are each a small, well-known piece of work. `@zerolith/state` ships them as functions over signals, one form each, with nothing to configure:

| Function | For | Gives |
| --- | --- | --- |
| `stored(key, initial)` | A value kept across reloads and tabs | A writable signal kept in storage as JSON |
| `history(signal)` | Undo and redo | Checkpoints, `undo()`, `redo()`, and `canUndo` and `canRedo` as signals |
| `debounced(signal, ms)` | Work that waits for a quiet spell | A signal that follows the source after `ms` of quiet |
| `throttled(signal, ms)` | Work at a steady rate | A signal that follows the source at most once per `ms` |
| `selector(signal)` | A selection among many rows | A function from a key to a signal that is true for the selected key |

Install it with `npm install @zerolith/state`. It depends on `zerolith` alone.

## Kept in storage

`stored` reads its value from `localStorage` under the key when it is created, writes every set back as JSON, and sets itself again when another tab writes the key, so every tab shows the same value and a reload starts where the reader left off:

@include packages/state/test/examples/state.example.browser.test.ts#stored

A missing value takes the initial one quietly. A value that does not parse takes the initial one and reports `state_storage_unreadable`, since someone else wrote the key. `{ validate }` checks the shape as well: it receives each parsed value, on creation and from other tabs, and a value it refuses, or throws on, takes the initial one and reports the same code, so a value of another shape, such as another app's under the same key, never reaches the page. Setting `undefined` removes the key, so it reads back as the initial value, and a value JSON cannot hold, such as a BigInt, stays in memory and reports `state_value_not_json`. Where the page has no storage, on the server or in a browser that refuses it, the signal is a plain one and `state_storage_unavailable` is reported once, as it is for each write the storage refuses. `{ storage: "session" }` keeps the value in `sessionStorage` instead, this tab's alone, and `{ equals }` is the signal's own equality.

Create each key once, at module level or in the app's root, and share the signal: two stored signals for one key in the same tab do not hear each other, since the storage event tells other tabs alone, and the second reports `state_key_duplicate`. The write and the listener for other tabs are disposed with the enclosing owner, as a component's effects are, after which the signal keeps its value in memory alone; created outside any owner, they live for the page.

## Undo and redo

`history` keeps checkpoints of a signal's value. Call `checkpoint()` before a change worth undoing, as an editor does before each edit; `undo()` sets the signal back to the last checkpoint and `redo()` brings the undone value back. A new checkpoint after an undo starts a new branch, as in most editors, so what was undone is gone:

@include packages/state/test/examples/state.example.browser.test.ts#history

`canUndo` and `canRedo` are signals, so a button follows them. Fifty checkpoints are kept, the oldest dropped when one more is saved; `{ limit }` sets the number. `dispose()` forgets them all and leaves the signal as it is.

`history` takes any writable signal, a stored one included. An undo is a set like any other, so storage follows it, and a reload opens on the text the reader left; the checkpoints live in memory, so after a reload there is nothing to undo:

@include packages/state/test/examples/state.example.browser.test.ts#draft

When another tab writes a stored signal's key, the history over it forgets every checkpoint. Each one holds a value from before that tab's change, so an undo to it would take the change back, in every tab. A history created inside a component stops listening for those writes when the component goes.

## After a quiet spell, or at most so often

`debounced` gives a signal that follows its source once the source has been quiet for the given time, so a search runs for the text the reader stopped typing rather than for each keystroke. `throttled` gives one that follows at most once per window: the first change in a window shows at once and the last one in it shows when the window ends, so a scroll position drives work at a steady rate:

@include packages/state/test/examples/state.example.browser.test.ts#timing

Both start at the source's current value, and a change still pending when the enclosing owner is disposed is dropped.

## Nested data edited in place

A store holds nested objects and arrays whose fields are signals, so a change to one field updates only what reads it. `store` takes a plain object and returns it read-only with its setter, which takes the path of keys to change and the value:

@include packages/state/test/examples/state.example.browser.test.ts#store

- **A field becomes a signal the first time a binding, an effect, or a computed value reads it**, so data rendered once costs no signal per field, and a read anywhere else, such as in an event handler, is a property lookup.
- **An object changes in place, and an array is replaced.** `setBoard("tasks", 1, "done", true)` changes one field of the task, and the list keeps its rows; writing an item of an array, or the array itself, gives the list a new array, so `each(computed(() => board.tasks), ...)` adds, removes, and moves rows by key.
- **The last argument can be a function** of the value there now, which returns the next, and `reconcile(data, "id")` merges data sent again whole: items with the same id keep their identity and change only in the fields that differ.
- **Writes go through the setter.** Assigning to the store, deleting a field, or calling `push` throws `state_store_assigned`, so every change is made where it can be seen; `snapshot(board)` gives a plain copy for code that wants ordinary objects. Maps, Sets, class instances, and frozen objects are kept as values, never wrapped.

Measured with a `computed` per row label: editing one row of 10,000 takes under 0.05 ms of script against 0.1 to 0.2 ms for replacing the array, since the list compares no keys; editing every 10th row costs the same either way, about 1 ms per 1,000 edits, and a signal written by hand for each label, bound directly, takes half that.

## A selection among many

A list that binds `selectedId.get() === row.id` in every row runs every row's comparison on each selection. `selector` turns the selected value into one signal per key, true for the selected key, and a change of the selection updates the two keys concerned alone:

@include packages/state/test/examples/state.example.browser.test.ts#selector

Keys are compared as `Map` keys are. A key's signal is shared by everyone who asks for it, and the selector keeps no hold of its own: the signal lives while a view reads it and goes with the row that did, so a list that scrolls through many keys holds the signals of the rows on screen.
