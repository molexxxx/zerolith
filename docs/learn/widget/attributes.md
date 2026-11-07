---
title: Attributes
description: Let the host page set the question through an attribute or a property, both of which reach the view as one signal.
order: 2
---

# Attributes

A page talks to an element the way it talks to an `<input>`: through attributes in its markup, such as `placeholder="Search"`, and through properties from script, such as `input.value = "Paris"`. Every prop listed in `define` is both, and both feed one signal that the view receives, so the view follows whichever the page uses, and keeps following it as it changes.

The question is the first thing a host page will want to set: a guide asks whether it helped, release notes ask whether they were useful.

## A question the page sets

Update `src/main.ts`:

@include packages/zerolith/test/fixtures/widget/attributes/src/main.ts

Update `src/components/feedback.ts`:

@include packages/zerolith/test/fixtures/widget/attributes/src/components/feedback.ts

`props: ["question"]` makes `question` an attribute the element observes and a property it exposes, and the view receives a `question` signal holding whichever was set last. The component treats it like any other signal: `legend` is a computed value that reads it, so the legend's text changes whenever the question does, and nothing else in the form is touched.

The signal's type is `unknown`, because the page decides what goes into it. An attribute is always a string, or `undefined` once it is removed, while a property holds whatever a script assigned, which could be a number or an object. `text` takes a string with something in it and nothing else, so an empty attribute, a removed one, or a property that is not a string all fall back to "Did this page help?". It sits outside the component because it uses nothing from it.

Now ask a question in `index.html`:

```html
<feedback-widget question="Did this guide help?"></feedback-widget>
```

## Both paths

With the dev server running, open the browser's console on the page and change the question both ways:

```js
const widget = document.querySelector("feedback-widget");
widget.setAttribute("question", "Was this useful?");
widget.question = "Did you find what you needed?";
widget.removeAttribute("question");
```

The legend follows each line: the attribute, then the property, then the default once the attribute is gone. Reading `widget.question` gives the current value whichever path set it, and `undefined` after the attribute is removed.

> [!TIP]
> Name props in lowercase. HTML lowercases attribute names, so a prop named `pageTitle` would be reachable as a property and never as an attribute.

## What you learned

- Each prop in `define` is an attribute and a property, and both feed one signal.
- An attribute arrives as a string or `undefined`, and a property as whatever was assigned, so the view checks what it gets.
- A computed value over a prop signal keeps the view current as the page changes the prop.
