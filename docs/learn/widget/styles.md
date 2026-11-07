---
title: Styles and theming
description: Give the widget scoped styles that never reach the rest of the page, and custom properties the host page sets to theme it.
order: 6
---

# Styles and theming

The widget has worked unstyled so far, wearing whatever the development page gives it. A widget that goes into other people's pages needs styles of its own that never touch the rest of the page, and a way for each page to fit it to its own look without editing it.

## A stylesheet for the widget

Create `src/components/feedback.css`:

@include packages/zerolith/test/fixtures/widget/app/src/components/feedback.css

Then import it in `src/components/feedback.ts`, and bind it to the `div` around the form:

@include packages/zerolith/test/fixtures/widget/app/src/components/feedback.ts

`?scoped` on the import turns the file into a scoped style sheet, and `class=${styles}` applies it: `:scope` is the `div`, and every other rule matches only inside it, so the widget's `button` rule styles the widget's button and no other button on the page. The rules reach the page through the browser's `@scope` rule, once however many widgets the page holds, and in the build they travel inside the widget's script, so a host page loads no stylesheet for it.

Send dims while a request runs, through the `aria-disabled` attribute from the sending step, and the panel fits a narrow column, such as a sidebar or a phone.

## Custom properties for the host page

Every color, the border, and the corner radius come from a custom property, with a default after the comma:

| Property | Sets | Default |
| --- | --- | --- |
| `--feedback-accent` | The Send button, the chosen answer, and the focus ring | `#1f5fd1` |
| `--feedback-on-accent` | The text on the Send button | `#ffffff` |
| `--feedback-text` | The text | `#1f2328` |
| `--feedback-background` | The panel | `#ffffff` |
| `--feedback-border` | The borders of the panel and the comment field | `#6e7781` |
| `--feedback-radius` | The corners | `0.5rem` |

A custom property is inherited, so a host page sets it on the element or on anything around it, in its own stylesheet, and the widget follows. The page owns its colors without knowing how the widget is built, and a page with a dark theme sets them in its dark rules as well. The defaults keep the text and the button's label at a contrast of at least 4.5 to 1, the level WCAG asks for, and a page that sets its own colors should keep to it too.

Theme the development page. Update `src/styles.css`:

@include packages/zerolith/test/fixtures/widget/app/src/styles.css

## What the page's styles reach

The widget has no shadow root, so its markup sits in the page's DOM like the page's own: the widget's rules stop at its edge, but the page's rules reach in. Two things follow.

The widget takes the page's font. Text inherits it, and the button and the comment field, which browsers set in a font of their own, take `font: inherit`, so the widget reads as part of the page it is on, with no property to set.

A page's broad rules apply as well. A page rule for every `button` that sets something the widget leaves alone, such as `text-transform`, changes the widget's button too. A page that wants the widget left alone writes such a rule so it skips the element, as in `button:not(feedback-widget button)`.

## What you learned

- A stylesheet imported with `?scoped` and bound with `class` styles the widget and nothing outside it, and ships inside its script.
- Custom properties with defaults are the theme a host page sets, in its own stylesheet.
- With no shadow root, the page's font and its broad rules reach the widget; `font: inherit` makes the first one work for the controls too.
