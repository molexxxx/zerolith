---
title: A page per release
description: Give each release a page at an address with its version, link to it from the list, and give each one a title of its own.
order: 3
---

# A page per release

A release's notes deserve an address of their own, such as `/releases/2.3.0/notes`, so a link in a chat or a changelog can point straight at them and the browser's back button returns to the list. In the route table, that is one route whose path has a parameter. It needs a page to show first.

## A heading that takes focus

Pressing Enter on a link replaces the page, and the link that had the keyboard focus goes with it, so focus falls back to the document itself, and a screen reader says nothing about the new page. A page's heading can take the focus instead. Create `src/components/page-heading.ts`:

@include packages/zerolith/test/fixtures/release-notes/release/src/components/page-heading.ts

`ref` hands the element to a function when the element is created, before its template is in the document, so `focusOnOpen` waits a microtask, by which time the template has been inserted. `preventScroll: true` leaves scrolling to the router, which restores your place in the list when the back button returns to it. `tabindex="-1"` is the same as on the list's heading in the last step, and `retry` in `load-status.ts` finds this heading as it found that one.

The `css` rule drops the focus ring from the heading. A browser can draw the ring around an element that takes focus from code, and a heading is not a control: someone who opens a link should not find a box around the title.

## The page

Create `src/components/release.ts`:

@include packages/zerolith/test/fixtures/release-notes/release/src/components/release.ts

The list already loads every release with its notes, so the page finds its release in `releases` rather than asking the server again: coming from the list, the notes show at once. A link straight to a release's page starts the app on that page, and the store loads the file as it does on any start, so the page shows `LoadStatus`, the same loading sentence and Try again button the list has, until the file arrives. The heading needs nothing from the file, so it shows from the start.

`release` is the release with this version, or `undefined` while the list loads or when no release has the version. `when` shows the notes once it is found; `missing` is true only once the list has loaded without it, so an address such as `/releases/9.9.9/notes` says there is no such release instead of loading forever. The notes are plain strings, so each one is its own key.

> [!NOTE]
> A route can also have a `load` function, which the router runs before it shows the page, as the [routing guide](../../guide/routing.md#pages-are-components) shows. It suits data that only that page uses. Here the data is the list every page already shares, so the page reads it there.

## The route

Import the page in `src/routes.ts`:

@include packages/zerolith/test/fixtures/release-notes/release/src/routes.ts#import excerpt

Then add an entry after `releases`, with a comma after the `releases` entry first:

@include packages/zerolith/test/fixtures/release-notes/release/src/routes.ts#route excerpt

`:version` in the path is a parameter: it matches one segment of the address, so `/releases/2.3.0/notes` matches with `params.version` set to `"2.3.0"`. The router reads the parameter names from the path, so `params.version` is typed, and a misspelled `params.verison` is a type error.

> [!WARNING]
> The address ends in `/notes` because a version has dots. A last segment with a dot, such as the `2.3.0` of `/releases/2.3.0`, looks like a request for a file with the extension `.0`, and `zerolith dev`, `zerolith preview`, and a host set up as [building and serving](../../guide/deploying.md) advises answer a missing file with a 404 rather than `index.html`. A link from the list would still work, since the router handles it in the page, but a reload or a link from elsewhere would not reach the app. With `/notes` at the end, the last segment has no dot, and the server answers with `index.html` as it does for any other page.

`head` can be a function as well as an object. The router calls it with the parameters each time the route is shown, so every release gets a title of its own in the browser tab, `2.3.0 release notes`, and in the history list and bookmarks. The title comes from the address alone, so it is right at once, even before the releases have loaded.

## The links

Update `src/components/release-row.ts`, so each row links to its release:

@include packages/zerolith/test/fixtures/release-notes/release/src/components/release-row.ts

`router.href("release", { version })` builds `/releases/2.3.0/notes` from the route's name and its parameter, encoded for the address. A missing or misspelled parameter is a type error, so a link cannot leave out the version. The link is a plain anchor: the router handles the click and shows the page without reloading it.

The list needs the new heading too. In `src/components/releases.ts`, import it with `import { PageHeading } from "./page-heading.ts";` and replace the `h1` line with `${PageHeading({ text: "Release notes" })}`.

Click a release, then the back button, then reload on a release's page: each time the right page shows, with its title in the tab and focus on its heading. Then change the version in the address to one that does not exist.

## What you learned

- A path parameter, as in `/releases/:version/notes`, matches one segment, and the view receives it typed in `params`.
- `head` as a function gives each page a title from its parameters.
- `router.href` builds a link from a route's name and its parameters.
- A page that reads a shared resource shows the same loading and error states when a link opens it directly.
- A `ref` that focuses the heading keeps keyboard and screen reader users with the page when the router replaces it.
