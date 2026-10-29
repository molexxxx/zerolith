---
title: Styles
description: Scoped component styles with the css tag, built on constructable stylesheets and the @scope rule, with no shadow DOM.
order: 4
---

# Styles

A `css` literal becomes one stylesheet, adopted by the document when the module loads, whose rules are wrapped in an `@scope` block keyed by a class derived from the text. Bind the result to a root element's class attribute.

@include packages/zerolith/test/examples/guide.example.browser.test.ts#styles

The scope's lower bound is the interior of any nested scoped component: a parent can style a child's root element but nothing inside it. `:scope` selects the root itself. There is no shadow DOM, so design tokens, resets, and global stylesheets apply as usual.

Values interpolated into `css` may be numbers or other `css` results; strings fail with `css_value_not_allowed`, so untrusted text can never become CSS. Put dynamic values in custom properties set through a style binding.

Support basis: `@scope` in Chrome 118, Safari 17.4, and Firefox 146; constructable stylesheets since Safari 16.4.
