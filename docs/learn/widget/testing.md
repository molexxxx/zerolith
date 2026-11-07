---
title: Testing
description: Test the element in a real browser the way a host page uses it, with the example handler standing in for the backend, and check that every control has a name.
order: 7
---

# Testing

A test for the widget does what a host page and a reader do: put the element on a page, answer the question, press Send, and read what the widget says. The backend is the one part a test should not reach over the network, and the example handler is already a function from `Request` to `Response`, which is all `fetch` has to be for the client.

Create `test/feedback.browser.test.ts`:

@include packages/zerolith/test/fixtures/widget/app/test/feedback.browser.test.ts test

`await import("../src/main.ts")` runs the entry, which defines the element, as the script tag does on a host page. The dynamic form is what the starter's linter asks for, since it refuses an import that assigns nothing. `mount` renders the element, written in an `html` template like any other markup, into a container on the page, and `cleanup`, after each test, removes it, which disposes the widget's view.

`vi.stubGlobal("fetch", ...)` replaces `fetch` for one test, and `vi.unstubAllGlobals()` puts it back. The client looks `fetch` up each time it sends, so the widget posts to the stand-in. In the first test the stand-in is the example handler, so the widget and the handler are checked against each other: what the handler saves is what the reader entered, and the event carries it with the handler's id. In the second, it answers `429` with a problem, as a backend that limits its senders would.

The answer arrives a few promises later, so `vi.waitFor` runs the check again until it passes or a second has gone by. The third test uses `accessibilityIssues`, which finds the defects a test can see without an accessibility tree: here, a control or a button without a name. Delete the `<label>` around the comment field and it fails, naming the control.

Vitest drives a real Chromium through Playwright. On a machine that has not run Playwright before, download the browser once:

```sh
npx playwright install chromium
```

Then run the tests:

```sh
npm test
```

## What you learned

- A test puts the element on the page and uses it as a reader does.
- A handler written as a function from `Request` to `Response` can stand in for `fetch`, so the test covers both sides of the contract without a network.
- `vi.waitFor` retries a check until a request has finished, and `accessibilityIssues` catches unnamed controls in every test run.
