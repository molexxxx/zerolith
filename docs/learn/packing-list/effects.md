---
title: Saving with effects
description: Load the list from the browser's storage and save every change with an effect.
order: 6
---

# Saving with effects

Reload the page and your list is back to the three starting items. That's because the list only lives in memory. In this step you'll save it in the browser's storage and load it again when the app starts.

Saving to storage is a **side effect**: it does something outside the page. In zerolith, code that runs whenever some signals change is called an **effect**.

## Load, then save

Update `src/store.ts`:

@include packages/zerolith/test/fixtures/tutorial/effects/src/store.ts

`stored()` runs once, when the app starts. It gives `items` its starting value: the saved list if there is one, or the three starting items if not.

Reading storage can go wrong in a few ways:

- In a private window, storage may be turned off, and reading it throws an error.
- The saved text might not be valid JSON.
- Another app might have saved something under the same key. While you develop, every app at the same address shares one storage.

`isItem` checks each saved entry. If anything is wrong, the app uses the starting items instead of breaking.

The `effect` runs once right away. After that, it runs again whenever a signal it read changes. It reads `items`, so every change to the list saves it. It never reads `filter`, so changing the filter saves nothing.

You don't list what an effect depends on. It depends on exactly the signals it read the last time it ran.

## Where effects belong

An effect at the top of a file, like this one, runs for as long as the page is open. An effect created inside a component stops when that component is removed. When a page closes, its effects stop with it.

> [!TIP]
> Use effects for work outside the page, such as storage, timers, or logging. For anything the page shows, use a computed value in the template instead of an effect that changes the page.

## Try it

Check a few items off and add one. Reload the page. Your list is still there.

## What you learned

- An `effect` runs right away, then again whenever a signal it read changes.
- zerolith tracks what an effect reads, so there's no list of dependencies to keep up to date.
- Use effects for side effects. What the page shows comes from the template.
