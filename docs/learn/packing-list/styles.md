---
title: Styles
description: Give a component its own styles with the css tag, scoped so they never leak into the rest of the page.
order: 8
---

# Styles

The page works. Now make it look like a packing list.

The starter's `src/styles.css` holds the styles for the whole app, and color variables such as `--text`, `--muted`, `--line`, and `--accent`. Styles that belong to one component live with that component.

## A styled row

Update `src/components/item.ts`:

@include packages/zerolith/test/fixtures/tutorial/app/src/components/item.ts

`css` makes a set of styles for one component. `class=${row}` applies them to the row.

- `:scope` means the row itself.
- Every other rule only matches inside the row. So `label` here styles the row's label and no other label on the page.

The styles are added to the page once, no matter how many rows there are. Your app's own styles and color variables still apply inside the row.

`min-width: 0` and `overflow-wrap: anywhere` let a long name with no spaces wrap inside its row. Without them, a long name would make the row too wide, and on a phone the page would scroll sideways.

`data-packed=${packed}` puts the item's state in an attribute, so the CSS can style packed items differently. The [styles guide](../../guide/styles.md) explains what happens when one styled component sits inside another.

## A styled page

You can also keep a component's styles in a CSS file next to it. Create `src/components/packing.css`:

@include packages/zerolith/test/fixtures/tutorial/app/src/components/packing.css

Then import it in `src/components/packing.ts`:

@include packages/zerolith/test/fixtures/tutorial/app/src/components/packing.ts

`?scoped` at the end of the import makes the file work like a `css` block. `class=${page}` applies it, and `:scope` means the `section`. Its rules stop at the rows, which have their own styles.

Which one should you use?

- A `css` block suits a few rules next to the markup, like the row.
- A CSS file suits a longer stylesheet. Your editor checks and completes it like any CSS file.

When you edit the CSS file, `npm run dev` updates the page without reloading it.

This is the finished page. `src/components/add-item.ts`, `src/components/filters.ts`, and `src/components/undo-redo.ts` stay as they were.

## Try it

The list now has rows with lines between them, and packed items are crossed out. Change a color in `packing.css` and save. The page updates without losing your place.

## What you learned

- `css` makes styles for one component, applied with `class=${styles}`.
- `:scope` is the element the styles apply to. Other rules only match inside it.
- A CSS file imported with `?scoped`, like `import page from "./packing.css?scoped"`, works the same way.
- An attribute that follows the state, such as `data-packed`, lets CSS style each state.
