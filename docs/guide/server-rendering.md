---
title: Server rendering
description: Rendering views to HTML with no DOM, with the same escaping and URL rules as the browser.
order: 5
---

# Server rendering

`zerolith/ssr` renders a view to an HTML string with no DOM. It works from the same scan of the template strings the browser uses and from the same binding rules, and a test asserts that the two renderers produce the same markup for the same view.

@include packages/zerolith/test/examples/ssr.example.test.ts#render

Signals are read once. `each` and `when` render their current state. Property, event, and ref bindings are client-only and render nothing. Effects created while rendering, inside `each` rows, `when` branches, and computed values, are disposed before the string is returned.

`renderStyles` returns a `<style>` element per `css` literal created so far, for the document head.

@include packages/zerolith/test/examples/ssr.example.test.ts#styles

This documentation site is rendered this way: its page shell is a zerolith view, and the build writes the strings to disk.
