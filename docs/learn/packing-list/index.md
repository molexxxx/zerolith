---
title: Packing list
description: "Build a packing list with zerolith, one small step at a time: add items, check them off, filter them, undo mistakes, and keep the list after a reload."
order: 0
---

# Build a packing list

You'll build a packing list for a trip. You can add items, check them off, show only what's left, undo a mistake, and close the tab without losing anything.

Each step adds one idea. By the end you'll have used every part of zerolith that most apps need.

## What you need

- Node 22.18 or newer. Run `node --version` to check.
- Some HTML and JavaScript. You don't need to know zerolith, or TypeScript beyond the basics.
- If you know React, Vue, Svelte, or Solid, the steps point out where zerolith works differently.

## Start a project

Run these three commands:

```sh
npx @zerolith/cli new packing-list --template ts --yes
cd packing-list
npm run dev
```

If `npx` asks to download the command line, answer `y`. The `--yes` flag picks the default answer for every other question.

`npm run dev` prints an address, such as `http://127.0.0.1:8080/`. Open it in your browser. Leave the server running while you work. Each time you save a file, the page reloads with your change.

## What the starter wrote

The starter is a small app with a few pages. Every zerolith app is laid out the same way:

| File | What it's for |
| --- | --- |
| `index.html` | The page the browser loads |
| `src/main.ts` | Starts the app |
| `src/routes.ts` | The list of pages and their addresses |
| `src/router.ts` | Switches between pages |
| `src/components/` | One file for each part of the screen |
| `src/styles.css` | Colors and styles for the whole app |
| `test/` | Tests, run with `npm test` |
| `zerolith.json` | Settings for the dev server and the build |
| `AGENTS.md` | Notes for a coding agent working in the project |
| `.agents/skills/`, `.claude/skills/` | What a coding agent needs to know about zerolith |

Open `src/components/counter.ts`. A number is stored, the page shows it, and a click changes it. The whole tutorial builds on that pattern.

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
> Stuck? Every zerolith error has a code and a link to a page with the cause and the fix. You can also try small pieces of code in the [playground](https://zerolith.dev/playground/).
