---
title: Accessibility
description: The primitives every component library rebuilds, as functions over the DOM: focus trap, roving tabindex, live announcer, focus origin, visually hidden text, and media query signals.
order: 14
---

# Accessibility

A framework cannot make an application accessible, but it can refuse to leave the hard parts to each project. `@zerolith/a11y` ships the pieces that Angular CDK exposes and React Aria is built on, as plain functions over the DOM with no dependency beyond `zerolith`. Most of them are `ref` callbacks: they attach when the element is created and clean up when its template is removed, so there is nothing to remember to tear down. `@zerolith/test` checks the defects a test can see; the guide on [testing](/guide/testing/) covers it.

## Dialogs: focus trap

A modal dialog must take focus when it opens, keep Tab inside, and give focus back when it closes. `focusTrap` does all three from one `ref`.

@include packages/a11y/test/examples/accessibility.example.browser.test.ts#dialog

By default focus lands on the first focusable element inside, or on the element itself; `initial` names another target or `false` to leave focus alone, and `restore: false` keeps focus where it is on removal. Focus that lands outside, by script or by a click, is pulled back in.

## Composite widgets: roving tabindex

Tabs, menus, listboxes, radio groups, and trees are one Tab stop with arrow keys inside. `rovingTabindex` keeps exactly one item in the Tab order, moves between items with the arrow keys, Home, and End, follows the item that is selected or checked, and picks up items added later.

@include packages/a11y/test/examples/accessibility.example.browser.test.ts#tabs

`orientation` chooses which arrow keys move, `loop` wraps at the ends, and `items` replaces the default selector of ARIA roles with your own.

## Announcements and hidden text

`createAnnouncer` writes messages into live regions that assistive technology reads without moving focus; `assertive` interrupts, `polite` waits. `visuallyHidden` is the clip pattern for text that only assistive technology should get.

@include packages/a11y/test/examples/accessibility.example.browser.test.ts#announce

## Focus origin

Focus rings belong on keyboard focus and are noise on pointer focus. `focusOrigin` watches how focus arrives and exposes it as a signal and as a `data-focus-origin` attribute on the root element, so one stylesheet rule does the rest:

```css
[data-focus-origin="keyboard"] :focus { outline: 2px solid var(--accent); }
```

## Preferences

`mediaQuery` turns a media query into a signal; `forcedColors` and `reducedMotion` wrap the two every interface should follow. Both are false on the server.

@include packages/a11y/test/examples/accessibility.example.browser.test.ts#motion
