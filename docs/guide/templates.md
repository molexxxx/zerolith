---
title: Templates
description: How html templates render and update, components, the five binding forms, keyed lists, conditions, JSX, raw markup, and what the renderer refuses.
order: 3
group: Basics
---

# Templates

A template describes a piece of the page. It is plain HTML written in a JavaScript tagged template, `` html`...` ``, and every `${...}` in it is a place the page changes: a text, an attribute, a list, or another template.

Three facts explain how zerolith renders one, and the rest of this guide follows from them:

1. **The markup is parsed once.** The first time a template runs, the browser parses its static HTML into a template element, and zerolith remembers where each `${...}` sits. Every later use clones that parsed copy, so a template costs one parse however many times it renders.
2. **Each expression becomes a part bound to one node.** The text after `Hello ` is one text node; a `class=${tone}` is one attribute. A part knows only its own node.
3. **A signal updates its part and nothing else.** When a signal in a part changes, that part writes its node directly. The component that built the template does not run again, and nothing is compared against a previous render, because there is no previous render to compare.

A complete component reads like this:

@include packages/zerolith/test/examples/guide.example.browser.test.ts#counter

Clicking the button sets `count`, which rewrites two text nodes: the count and the doubled value. `Counter()` ran once, when `render` called it, and never runs again.

> [!IMPORTANT]
> Bind the signal, not its value. `${count}` hands the signal itself to the part, which subscribes to it and stays in step. `${count.get()}` reads the number once, at render time, and the page never sees a later value. The Vite plugin and the command line warn about it as `template_frozen_read`.

@include packages/zerolith/test/examples/guide.example.browser.test.ts#frozen

Call `.get()` where code needs the value at that moment: inside `computed`, `effect`, the `params` of a `resource`, and event handlers, such as the button's handler above, which reads the count to add one to it.

## Components

A component is a plain function that takes one object of props and returns a view. There is no class, no hook rule, and no lifecycle to learn: the function runs once, builds its template, and from then on its signals keep the page current.

@include packages/zerolith/test/examples/guide.example.browser.test.ts#components

- **Props are a plain object.** A prop that should stay live is passed as a signal, as `count` is to `Badge`; a prop passed as a value is fixed for that use of the component.
- **Children are a prop.** Whatever a parent passes as `children` renders where the component places it, as `Panel` places its paragraph.
- **A component is called, not mounted.** `Badge({ count: unread })` returns the view to put in the template. Passing `Badge` itself, uncalled, fails with `unrenderable_value`.
- **State belongs where it is created.** A signal created inside a component lives as long as the component's view; one created in a module, as `count` in the counter above, is shared by everything that imports it. The [signals guide](signals.md) covers ownership and cleanup.

## Bindings

Where an expression sits in the markup decides what it binds to:

| Form | Binds | With `null` or `undefined` |
| --- | --- | --- |
| `${value}` as content | Text, a number, a signal, another template, a node, or a list of those. Booleans render nothing. | Renders nothing |
| `name=${value}` | An attribute. Several expressions can share one value, as in `class="card ${tone}"`. | Removes the attribute |
| `?name=${flag}` | A boolean attribute, present while the flag is truthy. | Removes the attribute |
| `.name=${value}` | A property of the element, such as `.value` on an input. | Assigns it to the property |
| `@name=${handler}` | An event listener: a function, or an object with `handleEvent` and optional `capture`, `passive`, and `once`. | Adds no listener |
| `ref=${target}` | Hands the element to a callback, or to a writable signal, which goes back to `undefined` when the element is removed. | Fails with `ref_not_assignable` |

Content, attributes, boolean attributes, and properties take a plain value or a signal, and a signal keeps them live. An event binding takes the handler itself, and a ref takes the callback or signal that receives the element.

@include packages/zerolith/test/examples/guide.example.browser.test.ts#bindings

Values are always inserted as text. `<b>Ada</b>` above shows as those characters, not as bold text, in both the input and the paragraph, so there is nothing to escape by hand and no way for data to turn into markup by accident.

## Lists

`each` renders one row per item of an array or a signal of an array. It takes three things: the items, a key function that names each row, and a row function that builds it.

@include packages/zerolith/test/examples/guide.example.browser.test.ts#lists

When the array changes, rows are matched by key, not by position:

- A row whose key is still present keeps its elements. Its item signal receives the new item, so only the bindings that read a changed field update; `write, edited` above changed one text node.
- A row whose key is gone is removed, and its effects stop.
- Rows that changed places move, and the fewest nodes move that can bring the list into the new order.

The row function receives the item as a signal, and, when it declares a second parameter, the row's position as a signal that follows its moves; a row function without that parameter skips creating it.

> [!TIP]
> A row's key never changes, so the row function can read it once at its top, as `const { id } = item.get();`, and use `id` as a plain value. Every other field stays a binding of the item signal, so an edit to it reaches the page.

> [!WARNING]
> Keys must be unique and defined. A repeated key fails the render with `each_key_duplicate` and a missing one with `each_key_undefined`, rather than quietly showing the wrong row.

## Conditions

`when` shows one branch or another, depending on a condition that can be a signal:

@include packages/zerolith/test/examples/guide.example.browser.test.ts#conditions

A branch is built only when it first shows, and taken down when it hides, which stops the effects it started. A change that keeps the condition's truthiness, such as from one user name to another, keeps the branch as it is; the greeting above updates through its own `${user}` binding instead.

## The same component in JSX

With a build step, the same template can be spelled as JSX in a `.jsx` or `.tsx` file. It is another spelling, not another runtime: the Vite plugin and the command line rewrite each JSX expression into the `html` call it stands for before any other step, components stay the functions they are, and everything above holds unchanged, binding the signal included.

@include packages/zerolith/test/examples/jsx.example.browser.test.tsx#jsx

| JSX | Template |
| --- | --- |
| `class="app"` | `class="app"`, static markup |
| `id={value}` | `id=${value}` |
| `prop:value={signal}` | `.value=${signal}` |
| `on:click={handler}` | `@click=${handler}` |
| `bool:disabled={flag}` | `?disabled=${flag}` |
| `ref={target}` | `ref=${target}` |
| `<Counter start={2}>child</Counter>` | `${Counter({ start: 2, children: "child" })}` |
| `<>...</>` | a template with no root element |

Lists and conditions are `each` and `when`, called as functions, exactly as in a template; there is no `<For>` or `<Show>`. Spread attributes on an element are refused, because a template cannot express an unknown set of attributes; spread onto a component is plain object spread. A `tsconfig` with `"jsx": "react-jsx"` and `"jsxImportSource": "zerolith"` types the elements and the namespaces.

> [!NOTE]
> JSX needs a build step, and the browser never sees it. A page that loads its modules as they are, from an import map, writes `html`.

## Raw markup

`unsafeHtml(markup)` inserts markup without escaping it. It exists for HTML you already trust, such as HTML your build rendered from Markdown you wrote.

> [!CAUTION]
> Never pass user input to `unsafeHtml`. Anything it receives runs as markup, scripts in event attributes included.

## What the renderer refuses

These fail with a coded error before anything reaches the page, each linked to its explanation and fix:

| What the template does | Error |
| --- | --- |
| Holds a `<script>` element | `script_in_template` |
| Puts an expression inside a comment | `binding_in_comment` |
| Puts an expression where a tag name or an attribute name goes | `binding_in_tag_position` |
| Puts an expression inside `<style>`, `<textarea>`, or another raw-text element | `binding_in_raw_text` |
| Binds the `.innerHTML`, `.outerHTML`, or `.srcdoc` property | `unsafe_property_binding` |
| Binds the `srcdoc` attribute or any attribute that starts with `on` | `unsafe_attribute_binding` |
| Renders a function or a plain object as content, usually a component passed instead of called | `unrenderable_value` |
| Gives `@event` something other than a function or a `handleEvent` object | `event_handler_not_function` |

One more is reported without failing the render: a `javascript:` or `vbscript:` URL, or a `data:` URL that is not an image, in `href`, `src`, `action`, `formaction`, or `poster` is removed and reported as `unsafe_url_blocked`.
