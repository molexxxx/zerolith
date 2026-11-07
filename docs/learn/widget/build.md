---
title: Build one script
description: Build the widget for production as one self-contained script with a name that stays the same from release to release.
order: 8
---

# Build one script

A host page loads the widget with one script tag, so the build has to produce one file that holds everything: the element, zerolith, the client, and the styles. That tag is written once, on someone else's site, so the file's name has to stay the same from release to release.

## The build

`zerolith build` normally starts from `index.html` and writes a page with hashed files. `--entry` starts from one module instead. In the `scripts` of `package.json`, change `build`:

```json
"build": "zerolith build --entry src/main.ts --name feedback-widget",
```

Then build:

```sh
npm run build
```

| File | What it is |
| --- | --- |
| `dist/feedback-widget.js` | The widget: your code, zerolith, the client, and the scoped styles |

That is the whole output. The script imports nothing and loads nothing else, and its name has no hash in it, so a host page's tag keeps working when you release a new version. `index.html` stays the page you develop on, and the build does not write it, so `npm run preview` has no page to serve; the [next step](embed.md) tries the script on a page of its own.

Lazy imports stay in the file too, and the widget's styles are in it because they are scoped. A stylesheet imported without `?scoped` would go to `dist/feedback-widget.css`, with a warning, since a host page would have to link it. [One script](../../guide/command-line.md#one-script) in the command line guide lists the rest.

## Serving it

Publish `feedback-widget.js` wherever host pages can reach it: next to your backend, on a static host, or on a CDN. Its name stays the same, so serve it with `Cache-Control: no-cache`, so that a host page picks up a new release at once. For a page that wants to stay on one release, build a file that never changes, with the version in its name, as `--name feedback-widget-1.4.0`, and cache that one for good.

The file is an ES module, so a host page loads it with `type="module"`. A browser loads a module from another origin only when the response allows it, so a server that hosts the file for other sites sends `Access-Control-Allow-Origin: *` with it. A host page that serves the file itself, from its own origin, needs nothing more. On a host where you cannot set that header, add `--classic` to the build, which writes a plain script that a page loads with `<script src>` from anywhere.

## What you learned

- `zerolith build --entry` writes a module and everything it imports as one self-contained script.
- `--name` gives that file a name a host page can keep.
- The file is an ES module, loaded with `type="module"`, and from another origin only with `Access-Control-Allow-Origin`; `--classic` writes a plain script that needs neither.
