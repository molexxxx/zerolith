---
title: Build one script
description: Build the widget for production as one self-contained script with a name that stays the same from release to release.
order: 8
---

# Build one script

A site adds the widget with one script tag, so the build needs to make one file that holds everything: the element, zerolith, the client, and the styles.

That script tag is written once, on someone else's site. So the file's name has to stay the same from one release to the next.

## The build

`zerolith build` usually starts from `index.html` and writes a whole page, with a code in each file's name. `--entry` starts from one file instead. In the `scripts` section of `package.json`, change `build`:

```json
"build": "zerolith build --entry src/main.ts --name feedback-widget",
```

Then build:

```sh
npm run build
```

| File | What it is |
| --- | --- |
| `dist/feedback-widget.js` | The widget: your code, zerolith, the client, and the styles |

That's the whole output:

- **One file.** It doesn't load anything else, so it's the whole widget.
- **A name that stays the same.** A site's script tag keeps working when you release a new version.
- **The styles are inside.** They were imported with `?scoped`. A stylesheet imported without `?scoped` would go to its own file, `dist/feedback-widget.css`, and the build would warn you, because every site would have to load it too.

`index.html` is still the page you develop on, but the build doesn't write it. So `npm run preview` has no page to show. The [next step](embed.md) tries the script on a page of its own. [One script](../../guide/command-line.md#one-script) in the command line guide has the details.

## Serving it

Put `feedback-widget.js` somewhere sites can reach it: next to your server, on a static host, or on a CDN.

Its name stays the same, so serve it with `Cache-Control: no-cache`. Then sites get a new release right away. For a site that wants to stay on one release, build a file with the version in its name, such as `--name feedback-widget-1.4.0`. That file never changes, so it can be cached forever.

The file is a JavaScript module, so a site loads it with `<script type="module">`. A browser only loads a module from another site if that server allows it, so the server hosting the file sends `Access-Control-Allow-Origin: *` with it. A site that serves the file from its own address doesn't need that.

If your host doesn't let you set that header, add `--classic` to the build. It writes a plain script that any page can load with `<script src>`, from anywhere.

## What you learned

- `zerolith build --entry` packs one file and everything it uses into one script.
- `--name` gives that script a name that stays the same.
- The script is a module, loaded with `type="module"`, and from another site only with `Access-Control-Allow-Origin`. `--classic` writes a plain script that needs neither.
