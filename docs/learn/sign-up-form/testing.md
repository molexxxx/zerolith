---
title: Testing
description: Write a browser test that fills in the form as a person does and answers its requests with the server's own function.
order: 7
---

# Testing

A form can go wrong in many ways, and most of them only show up when it talks to a server. A test can cover those without a network:

1. Put the page in a real browser.
2. Fill it in.
3. Answer its requests with the same function your server runs.

Create `test/sign-up.browser.test.ts`:

@include packages/zerolith/test/fixtures/sign-up-form/app/test/sign-up.browser.test.ts

**`vi.stubGlobal`** replaces `fetch` for each test. The replacement hands each request to `answer` from `server/sign-ups.ts`. `answer` takes a `Request` and returns a `Response`, and neither needs Node, so it runs in the browser next to the page. That one line tests the page and the server together: if either side breaks the contract, a test fails. `vi.unstubAllGlobals()` puts the real `fetch` back afterward.

**`type`** fills in a field and sends an `input` event. Setting a field's `value` from a script doesn't send one, and the page's `typed` listens for it. Clicking a radio button or a checkbox with `.click()` sends its own event.

**`vi.waitFor`** waits for the answer. A submit checks the rules and waits for `fetch`, so its result arrives a moment later. `vi.waitFor` keeps checking until it passes or time runs out. The packing list's tests didn't need it, because nothing there waits. Moving the focus to the welcome's heading also takes a moment, so that check waits too.

The accounts in `server/sign-ups.ts` last for the whole test file. The tests that sign up use `grace@example.com` once and `ada@example.com`, which exists from the start, so the order of the tests doesn't matter.

**`accessibilityIssues`** finds missing labels and names, as in the packing list. Delete the `<label>` from `TextField` and "names every control" fails. The [testing guide](../../guide/testing.md) covers the rest of `@zerolith/test`.

## Run the tests

The tests run in Chromium. If you've never used Playwright on this computer, download the browser once:

```sh
npx playwright install chromium
```

Then run the tests. The starter's counter test runs too:

```sh
npm test
```

To run everything at once, the type check, the linter, the tests, and the build, use `npm run check`.

## What you learned

- A server written as a function from `Request` to `Response` can answer a page's requests inside a test.
- `vi.stubGlobal` replaces `fetch` for a test, and `vi.waitFor` waits for an answer.
- Setting a field's `value` from a script sends no event, so the test sends the `input` event itself.
