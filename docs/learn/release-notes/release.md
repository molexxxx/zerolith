---
title: A page per release
description: Give each release a page at an address with its version, link to it from the list, and give each one a title of its own.
order: 3
---

# A page per release

Each release should have its own address, such as `/releases/2.3.0`. Then a link in a chat can point straight at it, and the back button returns to the list. That takes one route with a **parameter**, a part of the address that changes. First, the page it shows.

## The page

Create `src/components/release.ts`:

@include packages/zerolith/test/fixtures/release-notes/release/src/components/release.ts

The list already loaded every release with its notes, so the page looks up its release in `releases` instead of asking the server again. Coming from the list, the notes show right away.

A link straight to a release starts the app on that page, and the file loads as it does on any start. Until it arrives, the page shows `LoadStatus`, the same loading sentence and **Try again** button as the list. The heading doesn't need the file, so it shows from the start. Its `tabindex="-1"` lets `retry` move the focus to it, as on the list.

- `release` is the release with this version. It's `undefined` while the list loads, or if no release has that version.
- `when` shows the notes once the release is found.
- `missing` is only true once the list has loaded without the release. So an address like `/releases/9.9.9` says there's no such release, instead of loading forever.

The notes are plain strings, so each note is its own key.

> [!NOTE]
> A route can also have a `load` function, which the router runs before it shows the page, as the [routing guide](../../guide/routing.md#pages-are-components) shows. It suits data that only that page uses. Here every page already shares the list, so the page reads it from there.

## The route

In `src/routes.ts`, import the page:

@include packages/zerolith/test/fixtures/release-notes/release/src/routes.ts#import excerpt

Then add a route after `releases`. Add a comma after the `releases` route first:

@include packages/zerolith/test/fixtures/release-notes/release/src/routes.ts#route excerpt

`:version` in the path is a parameter. It matches one part of the address, so `/releases/2.3.0` matches with `params.version` set to `"2.3.0"`. The router reads the parameter's name from the path, so if you misspell `params.version`, your editor shows an error.

`head` can be a function. The router calls it with the parameters each time the page opens, so every release gets its own title, such as "2.3.0 release notes". The title shows in the browser tab, in the history, and in bookmarks. It only needs the address, so it's right even before the releases load.

## The links

Update `src/components/release-row.ts`, so each row links to its release:

@include packages/zerolith/test/fixtures/release-notes/release/src/components/release-row.ts

`router.href("release", { version })` builds `/releases/2.3.0` from the route's name and its parameter. If you leave out the version or misspell it, your editor shows an error. The link is a normal `<a>`. The router handles the click and shows the page without reloading.

When you press Enter on a link, the router moves the keyboard focus to the new page's heading. The starter's `src/router.ts` turns this on with `focus: "h1"`. Keyboard and screen reader users stay with the new page, and the scroll position doesn't jump.

## Try it

1. Click a release. Its page opens, with its title in the browser tab.
2. Press the back button. You're back on the list, where you left it.
3. Open a release and reload the page. The same release shows.
4. Tab to a link and press Enter. The focus lands on the new page's heading.
5. Change the version in the address to one that doesn't exist. The page says there's no such release.

## What you learned

- A path parameter, as in `/releases/:version`, matches one part of the address, and the page gets it in `params`.
- `head` as a function gives each page its own title.
- `router.href` builds a link from a route's name and its parameters.
- A page that reads a shared resource shows the same loading and error states when someone opens it directly.
- The router's `focus` option keeps keyboard and screen reader users on the new page.
