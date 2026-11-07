---
title: Styles
description: Give a component its own styles with the css tag, scoped so they never leak into the rest of the page.
order: 8
---

# Styles

The page works; now it should look like a packing list. The starter's `src/styles.css` sets the page-wide basics and the color variables, `--text`, `--muted`, `--line`, and `--accent`. Styles that belong to one component live with that component, written with the `css` tag.

## A styled row

Update `src/components/item.ts`:

@include packages/zerolith/test/fixtures/tutorial/app/src/components/item.ts

`css` returns a style sheet scoped to the elements that use it: `class=${row}` applies it to the row. Inside it, `:scope` is the row itself, and the other rules match only inside the row, so `label` here never styles a label anywhere else on the page. The styles are added to the document once, however many rows there are, with the browser's `@scope` rule and no shadow DOM, so the page's own styles and your design tokens still reach in.

`min-width: 0` and `overflow-wrap: anywhere` let a long name with no spaces wrap inside its row; without them, the name sets the row's width, and on a phone the page scrolls sideways.

`data-packed=${packed}` turns the item's state into an attribute the style sheet can select, which keeps the rule in CSS rather than in a class name built in JavaScript. The [styles guide](../guide/styles.md) shows where a scope stops when one styled component sits inside another.

## A styled page

The page's styles can live in a stylesheet of their own, beside the component. Create `src/components/packing.css`:

@include packages/zerolith/test/fixtures/tutorial/app/src/components/packing.css

Then import it in `src/components/packing.ts`:

@include packages/zerolith/test/fixtures/tutorial/app/src/components/packing.ts

`?scoped` on the import turns the file into the same scoped style sheet a `css` literal makes, and `class=${page}` applies it the same way: `:scope` is the `section`, and the rules stop at the rows, which have styles of their own. A literal suits a few rules beside the markup, as in the row; a file suits a longer stylesheet, which your editor checks and completes as CSS. `zerolith dev` applies an edit to the file in place, without reloading the page.

The page is now a `section` with its own scoped styles, and the list is the finished one. `src/components/add-item.ts`, `src/components/filters.ts`, and `src/components/undo-redo.ts` stay as they were.

## What you learned

- `css` writes a style sheet scoped to one component, applied with `class=${styles}`.
- `:scope` is the element the styles apply to; other rules match only inside it.
- A stylesheet imported with `?scoped`, as `import page from "./packing.css?scoped"`, is scoped the same way, for styles that read better in a file of their own.
- Attributes bound to state, such as `data-packed`, let CSS follow the state.
