---
title: Saving with effects
description: Load the list from the browser's storage and save every change with an effect.
order: 6
---

# Saving with effects

Reload the page and the list resets, because it lives only in memory. The fix is to read the list from the browser's storage when the app starts and write it back whenever it changes.

Writing to storage is a side effect: it reaches outside the page's own state. In zerolith, code that should run whenever some signals change is an `effect`.

## Load, then save

Update `src/store.ts`:

@include packages/zerolith/test/fixtures/tutorial/effects/src/store.ts

`stored()` runs once, when the module loads, and gives `items` its starting value: the saved list if there is one, the three starting items if not. Reading storage can fail, in a private window with storage turned off or with damaged data, so a failure falls back to the starting items instead of breaking the page.

The `effect` runs once right away and then again each time a signal it read changes. It reads `items`, so every `set()` saves the new list. It never reads `filter`, so changing the filter saves nothing. You never list the dependencies by hand: an effect depends on exactly what it read the last time it ran.

## Where effects belong

An effect at the top of a module, like this one, lasts as long as the page. An effect created inside a component belongs to that component and stops when the component is removed, so a page that closes takes its effects with it. Keep effects for work outside the page, such as storage, timers, or logging; anything the page shows should be a computed value bound into a template, not an effect that writes to the DOM.

Open the page, check a few items off, and reload: the list is still there.

## What you learned

- `effect` runs code now and again whenever a signal it read changes.
- Dependencies are tracked from what the code read; there is no list to keep up to date.
- Effects are for side effects; what the page shows comes from bindings.
