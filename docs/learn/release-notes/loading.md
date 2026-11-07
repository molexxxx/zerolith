---
title: Loading and errors
description: Say what the page is doing while the releases load, try a failed request again on its own, and give the reader a button for when that is not enough.
order: 2
---

# Loading and errors

On a slow connection the list stays empty for a while. If the file never arrives, it stays empty for good, and nothing says why.

A page that loads data needs to show three things, not one:

- that it's loading
- what it loaded
- that loading failed, with a way to try again

## Trying again by itself

Many failures fix themselves: a dropped connection, a server restarting, a request that hangs. A resource can try again before it gives up. Update `src/store.ts`:

@include packages/zerolith/test/fixtures/release-notes/loading/src/store.ts

Three options decide how patient the resource is:

- **`timeout: 10_000`** stops a request after ten seconds and counts it as a failure, so a request that hangs doesn't leave the page loading forever.
- **`retry: 2`** tries up to two more times after a failure. It waits 250 milliseconds before the first retry and 500 before the second, twice as long each time.
- **`retryIf`** decides which failures are worth another try. A 404 means the file isn't there, and asking again won't change that, so it fails right away. A server error, a dropped connection, or a timeout gets the retries.

The loader now throws an `HttpError`, which carries the response's status, so `retryIf` can tell a missing file from a server error. While the retries run, the resource still counts as loading. It only reports a failure after the last try fails.

## What the page says

Create `src/components/load-status.ts`:

@include packages/zerolith/test/fixtures/release-notes/loading/src/components/load-status.ts

`releases.status` is a signal that says where loading stands:

| Status | Means |
| --- | --- |
| `"pending"` | Loading, or waiting to try again |
| `"resolved"` | The releases are here |
| `"error"` | It gave up |

`messages` gives each status its sentence. `Record<ResourceStatus, string>` makes TypeScript check that every status has one.

The sentence goes in a paragraph with `role="status"`. Screen readers read it aloud when its text changes, so someone who can't see the list hears that it's loading, and hears if it failed. The paragraph always stays on the page, empty once the releases are there. A region that appears at the same moment as its text might not be read.

The **Try again** button only appears after a failure. It calls `releases.reload()`, which runs the loader again, retries included. The button disappears as soon as loading starts again, and the keyboard focus would disappear with it. So `retry` first moves the focus to the page's heading. `tabindex="-1"` on the heading lets code focus it without adding it to the Tab order.

## The page

Update `src/components/releases.ts`:

@include packages/zerolith/test/fixtures/release-notes/loading/src/components/releases.ts

## Try it

1. Rename `public/data/releases.json` to `releases.txt` and reload the page. The server answers 404, so the page says right away that the releases didn't load, and shows the button.
2. Rename the file back and press **Try again**. The list appears.
3. To see the loading sentence, open your browser's developer tools, pick a slow network in the Network panel, and reload.

## What you learned

- A resource's `status` and `reload()` give the page its loading and error states, and a way to try again.
- `retry`, `retryIf`, and `timeout` let a resource try again by itself, for the failures worth it.
- A `role="status"` paragraph that stays on the page reads each change aloud.
- Move the focus somewhere useful before the element that has it goes away.
