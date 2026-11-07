---
title: Loading and errors
description: Say what the page is doing while the releases load, try a failed request again on its own, and give the reader a button for when that is not enough.
order: 2
---

# Loading and errors

On a slow connection the list stays empty for a while, and when the file does not arrive at all, it stays empty for good, with nothing to say why. A page that loads data has three things to show, not one: that it is loading, what it loaded, and that the load failed, with a way to try again.

## Trying again on its own

Many failures pass on their own: a dropped connection, a server restarting during a deploy, a request that hangs. A resource can try again before it gives up. Update `src/store.ts`:

@include packages/zerolith/test/fixtures/release-notes/loading/src/store.ts

Three options decide how patient the resource is:

- `timeout: 10_000` stops a request that takes longer than ten seconds and counts it as a failure, so a request that hangs does not leave the page loading forever.
- `retry: 2` runs the loader up to twice more after a failure: the first time 250 milliseconds later, the second 500 milliseconds after that, since each wait is twice the one before.
- `retryIf` decides which failures are worth another try. A 404 means the file is not there, and asking again will not change that, so it fails at once. A server error, a dropped connection, or a timeout gets the retries.

The loader now throws an `HttpError`, which carries the response's status, so `retryIf` can tell a missing file from a server error. While the retries run, the resource still counts as loading; it reports a failure only once the last try has failed.

## What the page says

Create `src/components/load-status.ts`:

@include packages/zerolith/test/fixtures/release-notes/loading/src/components/load-status.ts

`releases.status` is a signal of where the load stands: `"pending"` while it runs or waits to retry, `"resolved"` once it has the releases, and `"error"` once it has given up. `messages` gives each status its sentence, and `Record<ResourceStatus, string>` makes TypeScript check that every status has one.

The sentence goes in a paragraph with `role="status"`, which assistive technology reads aloud when its text changes, so a reader who cannot see the list hears that it is loading and hears if it failed. The paragraph stays on the page, empty once the releases are there: a region that appears together with its text can go unread, so only its text changes.

The Try again button appears only after a failure, and calls `releases.reload()`, which runs the loader again with its retries. The button goes away as soon as the load starts again, and the keyboard focus would go with it, so `retry` first moves focus to the page's heading. `tabindex="-1"` on the heading lets code focus it without adding it to the Tab order.

## The page

Update `src/components/releases.ts`:

@include packages/zerolith/test/fixtures/release-notes/loading/src/components/releases.ts

To see the error, rename `public/data/releases.json` to `releases.txt` and reload the page: the server answers 404, so the page says the releases did not load, at once, with the button. Rename the file back and press Try again, and the list appears. To see the loading sentence, choose a slow connection in the network panel of the browser's developer tools and reload.

## What you learned

- A resource's `status` and `reload()` give the page its loading and error states and a way to try again.
- `retry`, `retryIf`, and `timeout` let the resource try again on its own, for the failures worth it.
- A `role="status"` region that stays on the page announces each change of its text.
- Focus moves somewhere useful before the element holding it goes away.
