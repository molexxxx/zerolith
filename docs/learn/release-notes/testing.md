---
title: Testing
description: Test the pages in a real browser with a stand-in for fetch, so the tests choose what the server answers.
order: 7
---

# Testing

The pages depend on a request, and a test should not depend on the network or on the file you keep editing. A test replaces `fetch` with a stand-in that answers what the test chooses: the releases it brings along, or a failure. The starter's `npm test` runs tests in a real browser with Vitest, as its `test/counter.browser.test.ts` shows.

Create `test/releases.browser.test.ts`:

@include packages/zerolith/test/fixtures/release-notes/app/test/releases.browser.test.ts test

`vi.stubGlobal("fetch", ...)` replaces the browser's `fetch` for the test, and `vi.unstubAllGlobals()` puts it back afterward. The stand-in answers with `Response.json(sample)`, a real `Response`, so the loader reads it as it reads the server's. `sample` is two releases, small enough that each test can say exactly what the page should show.

The store started loading when the test file imported it, before any stand-in existed, so `beforeEach` calls `releases.reload()`, which runs the loader again with the stand-in in place. A result from a request that a newer one replaced is dropped, so only the stand-in's answer reaches the page. The failure test does the same with a stand-in that answers 404, which the store does not retry, so the button shows at once.

The page creates effects and a debounced signal, which belong to the component's owner, so `mount` is passed a function: it runs the page inside the root it renders, and `cleanup` stops them with the page. `vi.waitFor` runs its check again until it passes, which covers the releases arriving from the stand-in and the pause the search waits for.

The tests use the app's own router, the one the components import. `router.navigate` goes to an address in the page the tests run in, and `router.outlet()` is the page it shows, the same view the layout places. `afterEach` navigates back to the address the tests started from, so a search or a page one test opened does not reach the next.

Vitest drives a real Chromium through Playwright. On a machine that has not run Playwright before, download the browser once:

```sh
npx playwright install chromium
```

Then run the tests:

```sh
npm test
```

## What you learned

- `vi.stubGlobal("fetch", ...)` lets a test choose what the server answers.
- `reload()` runs a resource's loader again, once the stand-in is in place.
- `mount(() => Page())` gives a page's effects an owner that `cleanup` disposes.
- `vi.waitFor` waits for requests and pauses without a fixed delay.
