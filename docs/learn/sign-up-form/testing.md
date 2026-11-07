---
title: Testing
description: Write a browser test that fills in the form as a person does and answers its requests with the server's own function.
order: 7
---

# Testing

A form has more ways to go wrong than most pages, and most of them only show when it talks to a server. A test can cover those paths without a network: mount the page in a real browser, fill it in, and answer its requests with the same function your backend runs.

Create `test/sign-up.browser.test.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/app/test/sign-up.browser.test.ts

`vi.stubGlobal` replaces `fetch` for each test with a function that hands the request to `answer` from `server/sign-ups.ts`. `answer` takes a `Request` and returns a `Response`, and neither needs Node, so it runs in the browser with the page. That one line tests the page and the backend together: a change to the contract on either side fails a test. `vi.unstubAllGlobals()` puts `fetch` back afterward.

Setting `value` from a script fires no event, so `type` sends the `input` event that typing would, which is what `typed` in the page listens for. `.click()` on a radio button or a checkbox fires its own.

A submission runs the schema and waits for `fetch`, so its result arrives a few promises later. `vi.waitFor` runs its check again until it passes or the time runs out, where a test without waiting, such as the packing list's, can check on the next line. Focus on the welcome's heading moves one microtask after the heading appears, so that check waits too.

The accounts in `server/sign-ups.ts` last as long as the module does, which is the whole test file. The tests that sign up use `grace@example.com`, once, and `ada@example.com`, which is there from the start, so their order does not matter.

`accessibilityIssues` finds the defects a test can see without an accessibility tree, as in the packing list: delete the `<label>` from `TextField` and "names every control" fails. The [testing guide](../../guide/testing.md) covers the rest of `@zerolith/test`.

Vitest drives a real Chromium through Playwright. On a machine that has not run Playwright before, download the browser once:

```sh
npx playwright install chromium
```

Then run the tests, with the starter's counter test beside yours:

```sh
npm test
```

The whole gate, type check, lint, tests, and build, is `npm run check`.

## What you learned

- A backend written as a function from `Request` to `Response` can answer a page's requests inside a test.
- `vi.stubGlobal` replaces `fetch` for a test, and `vi.waitFor` waits for a submission's result.
- Setting a field's `value` from a script fires no event, so a test sends the `input` event itself.
