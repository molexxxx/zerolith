---
title: Load the releases
description: Put the releases in a JSON file under public/, load it with a resource, and list it on a page of its own.
order: 1
---

# Load the releases

The release notes live in a file, not in your code. The page asks the server for the file and shows the releases once it arrives. Most data reaches a page this way, and a request takes time. So the page starts with nothing to show, and the releases arrive a moment later.

## The data

Files in `public/` are served exactly as they are, from the root of the site. The starter already keeps example data there, in `public/data/packages.json`. Create `public/data/releases.json` next to it:

@include packages/zerolith/test/fixtures/release-notes/app/public/data/releases.json

The dev server sends it at `/data/releases.json`. Open that address in your browser to see it.

## A resource

A value that comes from a request lives in a **resource**. Create `src/store.ts`:

@include packages/zerolith/test/fixtures/release-notes/list/src/store.ts

A resource has two parts:

- **`params`** says what to load. Here it's the file's address.
- **`loader`** loads it.

The loader gets the params and `abort`. `abort` is a signal that fires when nobody needs the result anymore, for example when the resource starts loading again before the first request finished. Passing it to `fetch` cancels that request.

`fetch` doesn't fail when the server answers with an error such as 404. So the loader checks `response.ok` and throws an error for anything that isn't a success.

`import.meta.env.BASE_URL` is the path the app is served from. It's `/` unless you build the app for a path such as `/notes/`, and it keeps the address right either way. `as Release[]` tells TypeScript what the file holds. It's your own file, so the code trusts it.

The resource is created at the top of the file. So it loads once, when the app starts, and every page that uses it shares the result. A resource is a signal: `releases.get()` is the list once it has loaded, and `undefined` until then.

## A row

Create `src/components/release-row.ts`, which shows one release:

@include packages/zerolith/test/fixtures/release-notes/list/src/components/release-row.ts

## The page

Create `src/components/releases.ts`:

@include packages/zerolith/test/fixtures/release-notes/list/src/components/releases.ts

`each` needs a signal that holds an array, but the resource holds `undefined` until the file arrives. So `all` is the list once it's loaded, or an empty list until then. Each row's key is its version, because no two releases share a version.

## The route and the link

In `src/routes.ts`, import the page next to the other imports:

@include packages/zerolith/test/fixtures/release-notes/list/src/routes.ts#import excerpt

Then add the route at the end of the list. The starter's last route, `packages`, has no comma after it, so add a comma there first:

@include packages/zerolith/test/fixtures/release-notes/list/src/routes.ts#route excerpt

In `src/components/layout.ts`, add a link to the `nav`, after the starter's three:

```ts
${Link({ href: router.href("releases"), label: "Releases", exact: false })}
```

`exact: false` marks the link as the current page on `/releases` and on every address under it. The release pages you'll add later live under it.

## Try it

Save your files and click **Releases** in the header. The seven releases appear, newest first.

## What you learned

- Files in `public/` are served as they are, from the root of the site.
- A `resource` loads a value: `params` says what, and `loader` loads it. Pass `abort` on to `fetch`.
- A resource is a signal of its value, and it's `undefined` until the first load finishes.
- A resource at the top of a file loads once, and every page shares it.
