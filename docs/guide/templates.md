---
title: Templates
description: The html tag, the five binding forms, keyed lists, conditions, refs, raw markup, and what the renderer refuses.
order: 3
---

# Templates

`html` is a tagged template. The static parts are parsed once into a template element; each expression becomes a part bound to one node. A signal in a part subscribes that part alone, so an update touches one text node or attribute and the component function never runs again.

## Bindings

| Form | Meaning |
| --- | --- |
| `${value}` as content | Text, a number, a signal, another template, a node, or an iterable of those. `null`, `undefined`, and booleans render nothing. |
| `name=${value}` | An attribute. `null` or `undefined` removes it. Several expressions can share one attribute value. |
| `?name=${flag}` | A boolean attribute, present when the flag is truthy. |
| `.name=${value}` | A property on the element, such as `.value` on an input. |
| `@name=${handler}` | An event listener: a function, or an object with `handleEvent` and optional `capture`, `passive`, `once`. |
| `ref=${target}` | Hands the element to a writable signal or a callback. |

@include packages/zerolith/test/examples/guide.example.browser.test.ts#bindings

Values are inserted as text. Markup in a string is never parsed, so there is nothing to escape by hand.

## Lists

`each` renders one row per item, keyed. Rows whose key survives are updated in place through an item signal, and reordering moves the fewest nodes.

@include packages/zerolith/test/examples/guide.example.browser.test.ts#lists

A key must be unique and defined; otherwise the render fails with `each_key_duplicate` or `each_key_undefined`.

## Conditions

`when` creates a branch lazily, disposes it when hidden, and ignores changes that keep the same truthiness.

@include packages/zerolith/test/examples/guide.example.browser.test.ts#conditions

## Raw markup

`unsafeHtml` is the one way to insert markup without escaping, for content you already trust, such as HTML rendered from Markdown you wrote. Never pass user input to it.

## What the renderer refuses

These fail with a coded error before anything reaches the DOM:

- A `<script>` element inside a template (`script_in_template`).
- An expression inside a comment, a tag name, an attribute name, or a raw-text element such as `<style>` or `<textarea>` (`binding_in_comment`, `binding_in_tag_position`, `binding_in_raw_text`).
- `.innerHTML`, `.outerHTML`, `srcdoc`, and `on*` attribute bindings (`unsafe_property_binding`, `unsafe_attribute_binding`).
- A function or a plain object as content (`unrenderable_value`), which is usually a component passed instead of called.
- A non-function event handler (`event_handler_not_function`).

A `javascript:` or `vbscript:` URL, or a non-image `data:` URL, in `href`, `src`, `action`, `formaction`, or `poster` is removed and reported as `unsafe_url_blocked`.
