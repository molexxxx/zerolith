---
title: Build a packing list
description: "The zerolith tutorial: start a project, then build a packing list page one idea at a time, from signals and lists to storage, styles, tests, and a deployed build."
order: 0
---

# Build a packing list

In this tutorial you build a packing list: a page where you add the things to take on a trip, check them off as they go in the bag, filter what is left, and find the list still there the next time you open the page. It is small enough to finish in an afternoon and touches every idea a zerolith application is made of.

Each step adds one idea and explains why it works the way it does before showing the code. Every file a step shows is run by zerolith's own test suite, so what you type is what was tested.

## What you need

- Node 24 or newer. Check with `node --version`.
- A terminal and an editor. Any editor works; one that understands TypeScript helps.
- No knowledge of zerolith or of signals. If you have used React, Vue, Svelte, or Solid, some ideas will look familiar, and the differences are pointed out as they come up.

## Start a project

`zerolith new` writes a starter application. This tutorial uses TypeScript with `html` templates, which run in the browser without a compiler:

```sh
npx @zerolith/cli@alpha new packing-list --template ts --yes
cd packing-list
npm run dev
```

`--template ts` picks the language and `--yes` takes the default for every other question: the zerolith command line as the dev server and build, one bundle for production, the in-page inspector, and the dependencies installed. Open the address `npm run dev` prints, http://127.0.0.1:8080/ unless that port is taken, and you see the starter's home page. Leave the server running; it reloads the page every time you save a file.

## What the starter wrote

The starter is a small routed application, and its files are the layout every zerolith application uses:

| File | What it owns |
| --- | --- |
| `index.html` | The page: one element to mount into and one module script |
| `src/main.ts` | The entry: waits for the first route, then renders the layout |
| `src/routes.ts` | The route table, one entry per page |
| `src/router.ts` | The router, in its own module so components can import it for links |
| `src/components/` | One file per component: the layout, the pages, and the counter |
| `src/styles.css` | The page-wide styles and the color variables the components use |
| `test/` | A browser test for the counter, run with `npm test` |
| `zerolith.json` | Settings the dev server, the build, and the preview share |
| `AGENTS.md` | The conventions, written for a coding agent working in the project |
| `.agents/skills/`, `.claude/skills/` | The zerolith skill, which coding agents load when a task involves zerolith |

Open `src/components/counter.ts`. It is the whole idea of zerolith in a dozen lines: a signal holds a number, the template binds it, and a click sets it. You will build the same way, one step further each page.

## The steps

1. [Add a page](page.md): a component and a route of its own.
2. [State and lists](state.md): the items in a signal, one row per item.
3. [Events and updates](events.md): check items off and add new ones.
4. [Components](components.md): split the page into parts that each run once.
5. [Derived state and conditions](derived.md): progress, filters, and an empty state.
6. [Saving with effects](effects.md): keep the list between visits.
7. [Styles](styles.md): styles that belong to one component.
8. [Testing](testing.md): a test that clicks through the page.
9. [Build and ship](ship.md): the production build and where to put it.

If you get stuck, every error zerolith reports carries a code and a link to a page that explains the cause and the fix, and the [playground](https://molexxxx.github.io/zerolith/playground/) runs small pieces of code without a project.
