---
title: Testing
description: Test the pages in a real browser with a stand-in for fetch, so the tests choose what the server answers.
order: 7
---

# Testing

The pages load data with a request. A test shouldn't depend on the network, or on a file you keep editing. So each test swaps `fetch` for a **stand-in**: a small function that answers whatever the test chooses, such as two releases, or a failure.

The starter's `npm test` runs tests in a real browser, as its `test/counter.browser.test.ts` shows.

Create `test/releases.browser.test.ts`:

@include packages/zerolith/test/fixtures/release-notes/app/test/releases.browser.test.ts test

**`vi.stubGlobal("fetch", ...)`** puts the stand-in in place of `fetch` for a test. `vi.unstubAllGlobals()` puts the real one back afterward. The stand-in answers with `Response.json(sample)`, a real `Response`, so the loader reads it like any server's answer. `sample` holds just two releases, so each test can say exactly what the page should show.

**`releases.reload()`** in `beforeEach` loads the data again. The store started loading as soon as the test file imported it, before any stand-in was in place, so this load uses the stand-in. The answer to the earlier request is thrown away, so only the stand-in's answer reaches the page. The failure test does the same with a stand-in that answers 404. The store doesn't retry a 404, so the button shows right away.

**`mount(() => Releases())`** takes a function. The page makes effects and a debounced signal, which belong to the component. When `mount` runs the page itself, `cleanup` can stop them along with the page.

**`vi.waitFor`** checks again and again until its check passes. That covers the releases arriving from the stand-in, and the pause the search waits for.

The tests use the app's own router, the one your components import. `router.navigate` goes to an address in the test page, and `router.outlet()` is the page it shows, the same one the layout shows. `afterEach` goes back to the address the tests started from, so a search or a page one test opened doesn't leak into the next.

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

- `vi.stubGlobal("fetch", ...)` lets a test choose what the server answers.
- `reload()` loads a resource again, once the stand-in is in place.
- `mount(() => Page())` lets `cleanup` stop a page's effects along with the page.
- `vi.waitFor` waits for requests and pauses without a fixed delay.
