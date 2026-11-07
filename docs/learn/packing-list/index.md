---
title: Packing list
description: "The zerolith tutorial: start a project, then build a packing list page one idea at a time, from signals and lists to storage and undo, styles, tests, and a deployed build."
order: 0
---

# Build a packing list

You build a packing list: add things to take on a trip, check them off, filter what is left, undo a mistake, and find the list still there next time. It touches every idea a zerolith app is made of.

## What you need

- Node 24 or newer.
- No knowledge of zerolith or signals. If you know React, Vue, Svelte, or Solid, the differences are pointed out as they come up.

## Start a project

The tutorial uses TypeScript with `html` templates, which need no compiler:

```sh
npx @zerolith/cli new packing-list --template ts --yes
cd packing-list
npm run dev
```

Answer `y` if `npx` asks to download the command line. `--yes` takes the default for every other question. Open the address `npm run dev` prints and leave the server running; it reloads the page on every save.

## What the starter wrote

The starter is a small routed application, and its files are the layout every zerolith application uses:

| File | What it owns |
| --- | --- |
| `index.html` | The page: the page-wide stylesheet, one module script, and one element to mount into |
| `src/main.ts` | The entry: waits for the first route, renders the layout, and mounts the inspector |
| `src/routes.ts` | The route table, one entry per page |
| `src/router.ts` | The router, in its own module so components can import it for links |
| `src/components/` | One file per component: the layout, the pages, and the counter |
| `src/styles.css` | The page-wide styles and the color variables the components use |
| `test/` | A browser test for the counter, run with `npm test` |
| `zerolith.json` | Settings the dev server, the build, and the preview share |
| `AGENTS.md` | The conventions, written for a coding agent working in the project |
| `.agents/skills/`, `.claude/skills/` | The zerolith skill, which coding agents load when a task involves zerolith |

Open `src/components/counter.ts`. It is the whole idea of zerolith in one short file: a signal holds a number, the template binds it, and a click sets it. You will build the same way, one step further each page.

## The steps

1. [Add a page](page.md): a component and a route of its own.
2. [State and lists](state.md): the items in a signal, one row per item.
3. [Events and updates](events.md): check items off and add new ones.
4. [Components](components.md): split the page into parts that each run once.
5. [Derived state](derived.md): progress, filters, and an empty state.
6. [Saving with effects](effects.md): keep the list between visits.
7. [Undo and offline](undo.md): a stored signal, undo and redo, and a note while offline.
8. [Styles](styles.md): styles that belong to one component.
9. [Testing](testing.md): a test that clicks through the page.
10. [Build and ship](ship.md): the production build and where to put it.

> [!TIP]
> If you get stuck, every error zerolith reports carries a code and a link to a page that explains the cause and the fix, and the [playground](https://zerolith.dev/playground/) runs small pieces of code without a project.
