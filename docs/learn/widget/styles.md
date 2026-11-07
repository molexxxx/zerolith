---
title: Styles and theming
description: Give the widget scoped styles that never reach the rest of the page, and custom properties the host page sets to theme it.
order: 6
---

# Styles and theming

So far the widget has no styles of its own. It just looks like whatever the development page gives it. A widget that goes on other people's sites needs two things:

- its own styles, which never change the rest of the page
- a way for each site to match it to its own look, without editing the widget

## A stylesheet for the widget

Create `src/components/feedback.css`:

@include packages/zerolith/test/fixtures/widget/app/src/components/feedback.css

Then import it in `src/components/feedback.ts`, and apply it to the `div` around the form:

@include packages/zerolith/test/fixtures/widget/app/src/components/feedback.ts

`?scoped` on the import makes the styles apply only inside the widget, and `class=${styles}` applies them. `:scope` means the `div`, and every other rule only matches inside it. So the widget's `button` rule styles the widget's button and no other button on the page.

The styles are added to the page once, no matter how many widgets it holds. When you build the widget, they travel inside its script, so a site doesn't need to load a stylesheet for it.

The Send button dims while a request is running, through its `aria-disabled` attribute from the sending step. The panel also fits a narrow column, such as a sidebar or a phone screen.

## Settings for the site

Every color, the border, and the corner radius come from a **custom property**, a CSS variable the site can set. Each has a default after the comma:

| Property | Sets | Default |
| --- | --- | --- |
| `--feedback-accent` | The Send button, the chosen answer, and the focus ring | `#1f5fd1` |
| `--feedback-on-accent` | The text on the Send button | `#ffffff` |
| `--feedback-text` | The text | `#1f2328` |
| `--feedback-background` | The panel | `#ffffff` |
| `--feedback-border` | The borders of the panel and the comment field | `#6e7781` |
| `--feedback-radius` | The corners | `0.5rem` |

Custom properties pass down from parent to child. So a site sets them on the element, or on anything around it, in its own stylesheet, and the widget follows. A site with a dark theme can set them in its dark styles too.

The defaults keep the text readable against its background, at a contrast of at least 4.5 to 1, the level the WCAG accessibility guidelines ask for. A site that sets its own colors should keep to that too.

Give the development page its own theme. Update `src/styles.css`:

@include packages/zerolith/test/fixtures/widget/app/src/styles.css

## What the site's styles reach

The widget has no shadow root, so its HTML sits in the page like the page's own. The widget's styles stop at its edge, but the page's styles reach in. That has two effects:

- **The widget uses the page's font.** Text inherits it. The button and the comment field, which browsers give a font of their own, use `font: inherit`. So the widget looks like part of the site it's on, with nothing to set.
- **The page's broad rules apply too.** If a site has a rule for every `button` that sets something the widget doesn't, such as `text-transform`, the widget's button changes too. A site that wants the widget left alone can skip it, as in `button:not(feedback-widget button)`.

## Try it

The widget now sits in a panel with a border. The development page sets two of the properties: a purple accent, so the Send button is purple, and `--feedback-radius: 0`, so the corners are square. Change `--feedback-accent` in `src/styles.css` and save. The button changes color.

## What you learned

- A stylesheet imported with `?scoped` and applied with `class` styles the widget and nothing else, and ships inside its script.
- Custom properties with defaults let a site theme the widget from its own stylesheet.
- Without a shadow root, the page's font and its broad rules reach the widget. `font: inherit` makes the font work for the controls too.
