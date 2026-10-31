---
title: Testing
description: Write a browser test that mounts the page, clicks through it, and checks it for accessibility defects.
order: 8
---

# Testing

The starter came with a test for its counter, in `test/counter.browser.test.ts`, and `npm test` runs it in a real browser with Vitest. A test for the packing list works the same way: mount the page, act on it the way a person would, and check what changed.

Create `test/packing.browser.test.ts`:

@include packages/zerolith/test/fixtures/tutorial/app/test/packing.browser.test.ts test

`mount` from `@zerolith/test` renders a view into a container attached to the document and returns it; `cleanup`, registered after each test, removes every mounted view. Since a click updates the page at once, the test checks the result on the next line, with no waiting.

`beforeEach` resets the items, because the list is module state shared by every test in the file and kept in storage between runs. Setting it explicitly at the start of each test makes the tests independent of each other and of what you clicked in the browser.

`accessibilityIssues` finds the defects a test can see without an accessibility tree: images without alternative text, form controls without a label, and buttons or links without a name. The remove buttons pass because of their `aria-label`; delete it and the third test fails, naming the button.

Run the tests:

```sh
npm test
```

## What you learned

- `mount` renders a view for a test and `cleanup` removes it.
- A click updates the page at once, so a test checks the result directly.
- `accessibilityIssues` catches unnamed controls and missing labels in every test run.
