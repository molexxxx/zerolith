---
title: A page per release
description: Give each release a page at an address with its version, link to it from the list, and give each one a title of its own.
order: 3
---

# A page per release

A release's notes deserve an address of their own, such as `/releases/2.3.0`, so a link in a chat or a changelog can point straight at them and the browser's back button returns to the list. In the route table, that is one route whose path has a parameter. It needs a page to show first.

## The page

Create `src/components/release.ts`:

@include packages/zerolith/test/fixtures/release-notes/release/src/components/release.ts

The list already loads every release with its notes, so the page finds its release in `releases` rather than asking the server again: coming from the list, the notes show at once. A link straight to a release's page starts the app on that page, and the store loads the file as it does on any start, so the page shows `LoadStatus`, the same loading sentence and Try again button the list has, until the file arrives. The heading needs nothing from the file, so it shows from the start, and `tabindex="-1"` lets `retry` in `load-status.ts` move focus to it, as it does on the list.

`release` is the release with this version, or `undefined` while the list loads or when no release has the version. `when` shows the notes once it is found; `missing` is true only once the list has loaded without it, so an address such as `/releases/9.9.9` says there is no such release instead of loading forever. The notes are plain strings, so each one is its own key.

> [!NOTE]
> A route can also have a `load` function, which the router runs before it shows the page, as the [routing guide](../../guide/routing.md#pages-are-components) shows. It suits data that only that page uses. Here the data is the list every page already shares, so the page reads it there.

## The route

Import the page in `src/routes.ts`:

@include packages/zerolith/test/fixtures/release-notes/release/src/routes.ts#import excerpt

Then add an entry after `releases`, with a comma after the `releases` entry first:

@include packages/zerolith/test/fixtures/release-notes/release/src/routes.ts#route excerpt

`:version` in the path is a parameter: it matches one segment of the address, so `/releases/2.3.0` matches with `params.version` set to `"2.3.0"`. The router reads the parameter names from the path, so `params.version` is typed, and a misspelled `params.verison` is a type error.

`head` can be a function as well as an object. The router calls it with the parameters each time the route is shown, so every release gets a title of its own in the browser tab, `2.3.0 release notes`, and in the history list and bookmarks. The title comes from the address alone, so it is right at once, even before the releases have loaded.

## The links

Update `src/components/release-row.ts`, so each row links to its release:

@include packages/zerolith/test/fixtures/release-notes/release/src/components/release-row.ts

`router.href("release", { version })` builds `/releases/2.3.0` from the route's name and its parameter, encoded for the address. A missing or misspelled parameter is a type error, so a link cannot leave out the version. The link is a plain anchor: the router handles the click and shows the page without reloading it.

Pressing Enter on a link replaces the page, and the link that had the keyboard focus goes with it. `focus: "h1"`, which the starter's `src/router.ts` already sets, moves focus to the new page's heading, so keyboard and screen reader users stay with the page. The scroll position does not move, so the back button still restores your place in the list, and the starter's stylesheet draws no ring around a heading, since it is not a control.

Click a release, then the back button, then reload on a release's page: each time the right page shows, with its title in the tab. Tab to a link and press Enter, and focus lands on the new page's heading. Then change the version in the address to one that does not exist.

## What you learned

- A path parameter, as in `/releases/:version`, matches one segment, and the view receives it typed in `params`.
- `head` as a function gives each page a title from its parameters.
- `router.href` builds a link from a route's name and its parameters.
- A page that reads a shared resource shows the same loading and error states when a link opens it directly.
- The router's `focus` option keeps keyboard and screen reader users with the page when it replaces the one they were on.
