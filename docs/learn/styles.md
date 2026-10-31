---
title: Styles
description: Give a component its own styles with the css tag, scoped so they never leak into the rest of the page.
order: 7
---

# Styles

The page works; now it should look like a packing list. The starter's `src/styles.css` sets the page-wide basics and the color variables, `--text`, `--muted`, `--line`, and `--accent`. Styles that belong to one component live with that component, written with the `css` tag.

## A styled row

Update `src/components/item.ts`:

@include packages/zerolith/test/fixtures/tutorial/app/src/components/item.ts

`css` returns a style sheet scoped to the elements that use it: `class=${row}` applies it to the row. Inside it, `:scope` is the row itself, and the other rules match only inside the row, so `label` here never styles a label anywhere else on the page. The styles are added to the document once, however many rows there are, with the browser's `@scope` rule and no shadow DOM, so the page's own styles and your design tokens still reach in.

`data-packed=${packed}` turns the item's state into an attribute the style sheet can select, which keeps the rule in CSS rather than in a class name built in JavaScript.

## A styled page

Update `src/components/packing.ts` the same way:

@include packages/zerolith/test/fixtures/tutorial/app/src/components/packing.ts

The page is now a `section` with its own scoped styles, and the list is the finished one. `src/components/add-item.ts` and `src/components/filters.ts` stay as they were.

## What you learned

- `css` writes a style sheet scoped to one component, applied with `class=${styles}`.
- `:scope` is the element the styles apply to; other rules match only inside it.
- Attributes bound to state, such as `data-packed`, let CSS follow the state.
