---
title: Load the releases
description: Put the releases in a JSON file under public/, load it with a resource, and list it on a page of its own.
order: 1
---

# Load the releases

The release notes live in a file, not in the code: the page asks the server for the file, and shows the releases once it arrives. Most data reaches a page this way, from a request that takes time, so the page is written to have nothing at first and the releases a moment later.

## The data

Files in `public/` are served as they are, at the site's root, and copied into the production build unchanged. The starter keeps its example data there, in `public/data/packages.json`. Create `public/data/releases.json` beside it:

@include packages/zerolith/test/fixtures/release-notes/app/public/data/releases.json

The server sends it at `/data/releases.json`. Open that address in the browser to see it.

## A resource

A value that arrives from a request lives in a `resource`. Create `src/store.ts`:

@include packages/zerolith/test/fixtures/release-notes/list/src/store.ts

A resource has two functions. `params` says what to load, here the file's address, and `loader` loads it. The loader receives the params and `abort`, a signal that fires when nobody is waiting for the result any more, such as when the resource loads again before the first request finished; passing it to `fetch` stops that request. `fetch` resolves for any answer the server gives, a 404 included, so the loader checks `response.ok` and throws for anything else.

`import.meta.env.BASE_URL` is the path the app is served under, `/` unless the build is given another, so the address stays right when the app moves under a path such as `/notes/`. The `as Release[]` tells TypeScript what the file holds; it is your own file, so the code trusts it.

The resource is created at the top of the module, so it loads once, when the app starts, and every page that imports it shares what it loaded. A resource is a signal: `releases.get()` is the list once it has loaded, and `undefined` until then.

## A row

Create `src/components/release-row.ts`, which shows one release:

@include packages/zerolith/test/fixtures/release-notes/list/src/components/release-row.ts

## The page

Create `src/components/releases.ts`:

@include packages/zerolith/test/fixtures/release-notes/list/src/components/releases.ts

`each` takes a signal of an array, and the resource holds `undefined` until the file arrives, so `all` is the list or an empty one. Rows are keyed by version, the one value no two releases share.

## The route and the link

Import the page in `src/routes.ts`, next to the other imports:

@include packages/zerolith/test/fixtures/release-notes/list/src/routes.ts#import excerpt

Then add an entry at the end of the table. The starter's last entry, `packages`, has no comma after it, so add one there first:

@include packages/zerolith/test/fixtures/release-notes/list/src/routes.ts#route excerpt

In `src/components/layout.ts`, add a link to the `nav`, after the starter's three: `${Link({ href: router.href("releases"), label: "Releases", exact: false })}`. With `exact: false`, the link is marked as the current page on `/releases` and on every address below it, which the release pages will be.

Save, click Releases in the header, and the seven releases appear, newest first.

## What you learned

- Files in `public/` are served as they are, at the site's root.
- `resource` loads a value from `params` with its `loader`, and passes `abort` on to `fetch`.
- A resource is a signal of its value, `undefined` until the first load.
- A resource at the top of a module loads once and is shared by every page.
