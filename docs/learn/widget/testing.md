---
title: Testing
description: Test the element in a real browser the way a host page uses it, with the example handler standing in for the backend, and check that every control has a name.
order: 7
---

# Testing

A test for the widget does what a site and a reader do:

1. Put the element on a page.
2. Answer the question and press Send.
3. Read what the widget says.

The server is the one part a test shouldn't reach over the network. The example server is already a function from `Request` to `Response`, and that's all the client needs `fetch` to be.

Create `test/feedback.browser.test.ts`:

@include packages/zerolith/test/fixtures/widget/app/test/feedback.browser.test.ts test

**`import "../src/main.ts"`** runs the widget's script, which defines the element, just as the script tag does on a real site.

**`mount`** puts the element on the page, written in an `html` template like any other HTML. **`cleanup`** runs after each test and removes it.

**`vi.stubGlobal("fetch", ...)`** swaps `fetch` for one test, and `vi.unstubAllGlobals()` puts it back. The client looks up `fetch` each time it sends, so the widget sends to the stand-in:

- In the first test, the stand-in is the example server itself. So the test checks the widget and the server against each other: the server saves what the reader entered, and the event carries it with the server's id.
- In the second test, the stand-in answers `429` with a problem, as a server that limits its senders would.

The answer arrives a moment later, so **`vi.waitFor`** keeps checking until it passes, or a second has gone by.

The third test uses **`accessibilityIssues`**, which finds controls and buttons without a name. Try deleting the `<label>` around the comment field: the test fails and names the control.

## Run the tests

The tests run in Chromium. If you've never used Playwright on this computer, download the browser once:

```sh
npx playwright install chromium
```

Then run the tests:

```sh
npm test
```

## What you learned

- A test puts the element on a page and uses it the way a reader does.
- A server written as a function from `Request` to `Response` can stand in for `fetch`, so one test covers both sides of the contract without a network.
- `vi.waitFor` keeps checking until a request has finished, and `accessibilityIssues` catches unnamed controls every time the tests run.
