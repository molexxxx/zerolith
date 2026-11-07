---
title: Build one script
description: Build the widget for production, see why the build is already one self-contained script, and copy it to a name that stays the same from release to release.
order: 8
---

# Build one script

A host page loads the widget with one script tag, so the build has to produce one script that holds everything: the element, zerolith, the client, and the styles.

## The build

```sh
npm run build
```

`zerolith build` starts from `index.html` and bundles every module script the page names, with everything those modules import. The development page names one, `src/main.ts`, so the build writes one script:

| File | What it is |
| --- | --- |
| `dist/assets/index-<hash>.js` | The widget: your code, zerolith, the client, and the scoped styles |
| `dist/assets/index-<hash>.css` | The development page's stylesheet |
| `dist/index.html` | The development page, with its inline listener |
| `dist/favicon.svg` | The starter's icon, copied from `public/` |

The script imports nothing and loads nothing else, so it is the whole widget. Everything else in `dist/` belongs to the development page, and a host page needs none of it.

> [!WARNING]
> Keep `index.html` to one module script with a `src`. The build bundles each such script as an entry of its own, and a module two entries share goes into a chunk both import, so a second script on the development page would split the widget across three files. The inline listener is not such a script: the build leaves it in the page.

## A name that stays the same

`index-<hash>.js` carries a hash of its content, so its name changes whenever the widget does. That suits an application's own files, since the build rewrites the page that loads them. A host page's script tag is written once, on someone else's site, and it should keep working when you release a new version.

`zerolith build` has no library mode: no option names an entry's file, and it always starts from `index.html`. So a short script copies the file after the build. Create `scripts/embed.ts`:

@include packages/zerolith/test/fixtures/widget/app/scripts/embed.ts

It finds the one script under `dist/assets`, copies it to `dist/feedback-widget.js`, and fails if there is not exactly one, since the widget would then not be one file. Make it part of the build, in the `scripts` of `package.json`:

```json
"build": "zerolith build && node scripts/embed.ts",
```

and add `"scripts"` to `include` in `tsconfig.json`, beside `"server"`, so `npx tsc` checks it too. Run `npm run build` again, and `dist/feedback-widget.js` is the widget.

## Serving it

Publish `feedback-widget.js` wherever host pages can reach it: next to your backend, on a static host, or on a CDN. Its name stays the same, so serve it with `Cache-Control: no-cache`, so that a host page picks up a new release at once. The hashed file beside it never changes and can be cached for good, for a page that wants to stay on one release; [Building and serving](../../guide/deploying.md) covers those caching rules.

The file is an ES module, the only format `zerolith build` writes, so a host page loads it with `type="module"`. A browser loads a module from another origin only when the response allows it, so a server that hosts the file for other sites sends `Access-Control-Allow-Origin: *` with it. A host page that serves the file itself, from its own origin, needs nothing more.

## What you learned

- With one module script on the page and nothing lazy, `zerolith build` writes one self-contained script.
- A short script after the build gives that file a name a host page can keep.
- The file is an ES module, loaded with `type="module"`, and from another origin only with `Access-Control-Allow-Origin`.
