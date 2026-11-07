---
title: Testing
description: Write a browser test that mounts the page, clicks through it, and checks it for accessibility defects.
order: 9
---

# Testing

The starter came with a test for its counter, in `test/counter.browser.test.ts`. `npm test` runs it in a real browser. A test for the packing list works the same way:

1. Put the page on the screen.
2. Use it the way a person would.
3. Check what changed.

Create `test/packing.browser.test.ts`:

@include packages/zerolith/test/fixtures/tutorial/app/test/packing.browser.test.ts test

**`mount`** from `@zerolith/test` puts a view on the page for the test. **`cleanup`** runs after each test and removes it.

A click updates the page right away, so the test can check the result on the next line. The starter's counter test waits with `await settle()` after each click. `settle()` waits for promises and timers, and this page has none, so its tests don't need to wait.

**`beforeEach`** resets three things before each test: the list, the filter, and the undo history. Every test in the file shares them, and the list is also saved in storage. Resetting them means one test can't change the result of the next, and neither can what you clicked in the browser. `changes.dispose()` clears the undo history without touching the list.

**`accessibilityIssues`** finds problems a test can see in the page's HTML:

- images without alternative text
- form fields without a label
- buttons or links without a name

The Remove buttons pass because they have text. Their `aria-label` also says which item each one removes, which a test can't judge for you. Try deleting the `<label>` around a checkbox: the third test fails and names the control. The [testing guide](../../guide/testing.md) covers the rest of `@zerolith/test`.

## Run the tests

The tests run in Chromium. If you've never used Playwright on this computer, download the browser once:

```sh
npx playwright install chromium
```

Then run the tests:

```sh
npm test
```

All the tests should pass.

## What you learned

- `mount` puts a view on the page for a test, and `cleanup` removes it.
- A click updates the page right away, so a test can check the result directly.
- `accessibilityIssues` catches missing labels and unnamed buttons every time the tests run.
