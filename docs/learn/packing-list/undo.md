---
title: Undo and offline
description: Keep the list with stored, take back a change with history, and note when the browser is offline, with two of zerolith's own packages.
order: 7
---

# Undo and offline

Most apps that save something need the code you just wrote. A packing list also needs two more things on a trip:

- A way to undo, for when you remove the wrong item.
- A note when you're offline, so you know the list still works.

zerolith has two packages for all of this, both built on signals:

- `@zerolith/state` for signals that save themselves, undo, and more.
- `@zerolith/browser` for what the browser knows, such as whether you're online.

Install both:

```sh
npm install @zerolith/state @zerolith/browser
```

## A stored signal

Update `src/store.ts`:

@include packages/zerolith/test/fixtures/tutorial/undo/src/store.ts

`stored` from `@zerolith/state` replaces your `stored()` function and the effect. It:

1. Reads the saved list when the app starts.
2. Uses the starting items if nothing is saved, or if what's saved isn't valid.
3. Saves the list as JSON every time it changes.

It uses the same key and the same JSON as the last step, so the list you saved there loads as it was. `isItem` comes along from the last step as the `validate` option: anything that isn't a list of items is replaced by the starting items.

`stored` also does two things your version didn't:

- **It keeps tabs in sync.** Change the list in one tab, and every other open tab shows the same list.
- **It tells you when something's wrong.** A saved value that isn't valid is reported as `state_storage_unreadable`. Storage that the browser refuses is reported as `state_storage_unavailable`. The list keeps working either way. While you develop, these reports show in the browser console. A production build keeps the console quiet, as the [diagnostics guide](../../guide/diagnostics.md) explains.

`stored` doesn't need a name like `{ name: "items" }`. When you save a file, the page reloads and the list comes back from storage, as it does on any visit.

> [!NOTE]
> Make one stored signal for each key, at the top of a file as here, and import it wherever you need it. Two stored signals for the same key in one tab don't see each other's changes, and the second one is reported as `state_key_duplicate`.

## Undo and redo

`history(items)`, in the same file, keeps snapshots of the list, called checkpoints.

- `checkpoint()` saves the list as it is now. `toggle`, `add`, and `remove` each call it before they change anything.
- `undo()` puts the list back to the last checkpoint.
- `redo()` brings back what `undo()` took away.

If you make a new change after an undo, you can't redo anymore. Most editors work the same way.

Undo and redo change `items` like any other change. So the rows, the "packed" count, and the saved list all update.

The last fifty checkpoints are kept in memory. After a reload there's nothing to undo, but the list itself comes back from storage. Choosing a filter doesn't save a checkpoint, because it changes what you see, not the list.

Create `src/components/undo-redo.ts`:

@include packages/zerolith/test/fixtures/tutorial/undo/src/components/undo-redo.ts

`canUndo` and `canRedo` are signals. They're true when there's something to undo or redo, and the buttons follow them.

`?disabled=${noUndo}` starts with `?`, which binds a true-or-false attribute. The button has the `disabled` attribute while the value is true, and loses it while it's false. You need the `?`. Without it, `false` would become the attribute's text, and a button with any `disabled` attribute is disabled.

A disabled button can't keep the keyboard focus. When you undo the last change, the Undo button disables itself. `pressing` moves the focus to Redo, which that undo just turned on. It works the same way the other way around.

The [state guide](../../guide/state.md) covers the rest of `@zerolith/state`, such as signals that wait for typing to stop.

## Offline

Update `src/components/packing.ts`:

@include packages/zerolith/test/fixtures/tutorial/undo/src/components/packing.ts

`online()` from `@zerolith/browser` gives you a signal that's true while the browser is online. Any component can call it. The list is saved on this device, so nothing stops working offline, and the note says so.

The status line is always on the page. It's just empty while you're online. Screen readers read a `status` line aloud when its text changes. If the line appeared at the same moment as its text, a screen reader might not read it.

The [browser guide](../../guide/browser.md) covers the rest of `@zerolith/browser`, such as whether the tab is visible and the window's size.

## Try it

Remove an item, then press **Undo**. The item is back. Next, open your browser's developer tools and set the network to offline. The note "Offline: changes are saved on this device." appears.

## What you learned

- `stored` keeps a signal in storage. It loads when the app starts, saves on every change, and stays the same in every tab.
- `history` adds undo and redo, with `canUndo` and `canRedo` as signals.
- `online()` tells you whether the browser is online, as a signal.
- `?name=${flag}` adds an attribute while the flag is true, and removes it while it's false.
