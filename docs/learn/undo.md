---
title: Undo and offline
description: Keep the list with stored, take back a change with history, and note when the browser is offline, with two of zerolith's own packages.
order: 7
---

# Undo and offline

The store saves the list with an effect you wrote yourself, and every application that keeps something between visits needs the same lines. A packing list needs two more things on a trip: a way to take back the item you removed by mistake, and a word when the connection drops, so you know the list still works. zerolith covers all three in two packages of its own, built on signals: `@zerolith/state` for signals with a memory, and `@zerolith/browser` for what the browser knows about the page.

Install both:

```sh
npm install @zerolith/state @zerolith/browser
```

Each depends on `zerolith` alone.

## A stored signal

Update `src/store.ts`:

@include packages/zerolith/test/fixtures/tutorial/undo/src/store.ts

`stored` from `@zerolith/state` does what your `stored()` function and the effect did together. It reads the key when the module loads, takes the starting items when nothing is saved there or what is saved does not parse, and writes the list back as JSON on every `set()`. `isItem` comes along from the last step: `validate` receives what parses, and anything that is not a list of items takes the starting items as well. The key and the JSON are the ones the last step wrote, so the list you saved there loads as it was.

It also does what the hand-written version did not. When the list changes in another tab, the browser tells this one with a `storage` event, and `stored` sets itself to match, so every open tab shows the same list. Nothing fails in silence either: a saved value that does not parse, or that `validate` refuses, is reported as `state_storage_unreadable`, and storage the browser refuses as `state_storage_unavailable`, while the list keeps working for the visit. While you develop, each report appears in the console; a production build keeps the console quiet and hands reports only to `onDiagnostic` listeners, as the [diagnostics guide](../guide/diagnostics.md) shows.

`stored` takes no name, and needs none: after an edit, `zerolith dev` reloads the page and the list comes back from storage, as it does on any visit.

> [!NOTE]
> Create one stored signal for each key, at the top of a module as here, and import it wherever it is needed. Two stored signals for one key in the same tab do not hear each other, and the second is reported as `state_key_duplicate`.

## Undo and redo

`history(items)`, in the same file, keeps checkpoints of the list. `checkpoint()` saves the list as it is, so `toggle`, `add`, and `remove` each call it before they change anything. `undo()` sets the list back to the last checkpoint, and `redo()` brings back what `undo()` took away. A change after an undo starts a new branch, as in most editors, so what was undone is gone.

Undo and redo set `items` as any change does, so the rows, the progress line, and the saved list all follow. The checkpoints live in memory, the last fifty of them: a reload starts with nothing to undo, while the list itself comes back from storage. Choosing a filter saves no checkpoint, since it changes what you see, not the list.

Create `src/components/undo-redo.ts`:

@include packages/zerolith/test/fixtures/tutorial/undo/src/components/undo-redo.ts

`canUndo` and `canRedo` are signals, true while there is somewhere to go, so the buttons follow them. `?disabled=${noUndo}` binds a boolean attribute, marked with `?` as an event is with `@` and a property with `.`: the attribute is there while the value is true and gone while it is false. A plain `disabled=${noUndo}` would not do, since `false` would become the attribute's text, and a button with a `disabled` attribute is disabled whatever the text says. Each click runs the history's own `undo` or `redo` through `pressing`. A disabled button cannot hold focus, so when Undo takes back the last change and turns itself off, `pressing` moves focus to Redo, which that undo has just turned on, and the other way around.

The [state guide](../guide/state.md) covers the rest of `@zerolith/state`: signals that wait for typing to stop or follow a scroll at a steady rate, and a selector that tells each of a thousand rows whether it is the selected one.

## Offline

Update `src/components/packing.ts`:

@include packages/zerolith/test/fixtures/tutorial/undo/src/components/packing.ts

`online()` from `@zerolith/browser` returns a signal of whether the browser is online, following the browser's `online` and `offline` events. There is one for the page, started the first time anything asks for it, so any component can call it. The list lives on this device, so nothing stops working offline, and the note says so.

The status paragraph stays on the page, empty while the browser is online. Assistive technology reads a `status` region aloud when its text changes, and a region that appears together with its text can go unread, so the paragraph stays and only its text changes.

The [browser guide](../guide/browser.md) covers the rest of `@zerolith/browser`: whether the tab is visible, the window's size, and an element's size and whether it is in view.

Remove an item and press Undo, and it is back. Then set the network to offline in the browser's developer tools, and the note appears.

## What you learned

- `stored` keeps a signal in storage under a key: read when it is created, written on every set, and the same in every tab.
- `history` gives a signal undo and redo from checkpoints, with `canUndo` and `canRedo` as signals.
- `online()` gives the browser's connection as a signal, one for the page.
- `?name=${flag}` binds a boolean attribute, there while the flag is true.
