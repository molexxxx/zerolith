---
title: Attributes
description: Let the host page set the question through an attribute or a property, both of which reach the view as one signal.
order: 2
---

# Attributes

A page talks to an element the same way it talks to an `<input>`, in two ways:

- **Attributes** in its HTML, such as `placeholder="Search"`.
- **Properties** from a script, such as `input.value = "Paris"`.

Every prop you list in `define` works both ways. Both feed one signal that the view gets, so the view follows whichever one the page uses, and keeps following it as it changes.

The question is the first thing a site will want to set. A guide asks whether it helped. Release notes ask whether they were useful.

## A question the page sets

Update `src/main.ts`:

@include packages/zerolith/test/fixtures/widget/attributes/src/main.ts

Update `src/components/feedback.ts`:

@include packages/zerolith/test/fixtures/widget/attributes/src/components/feedback.ts

`props: ["question"]` makes `question` both an attribute and a property. The view gets a `question` signal that holds whichever one was set last. `legend` is a computed value that reads it, so the legend's text changes whenever the question does. Nothing else in the form changes.

The signal's type is `unknown`, because the page decides what goes in it:

- An attribute is always a string, or `undefined` once it's removed.
- A property can be anything a script sets, such as a number or an object.

`text` only accepts a string that isn't empty. For anything else, such as an empty attribute, a removed one, or a property that isn't a string, it uses "Did this page help?" instead. It sits outside the component because it doesn't use anything from inside it.

Now set a question in `index.html`:

```html
<feedback-widget question="Did this guide help?"></feedback-widget>
```

## Try it

With the dev server running, open your browser's console on the page and change the question both ways, one line at a time:

```js
const widget = document.querySelector("feedback-widget");
widget.setAttribute("question", "Was this useful?");
widget.question = "Did you find what you needed?";
widget.removeAttribute("question");
```

The legend follows each line: first the attribute, then the property, then the default once the attribute is gone. `widget.question` always reads the current value, whichever way it was set, and `undefined` after the attribute is removed.

> [!TIP]
> Name props in lowercase. HTML turns attribute names into lowercase, so a prop named `pageTitle` would work as a property but never as an attribute.

## What you learned

- Each prop in `define` is both an attribute and a property, and both feed one signal.
- An attribute is a string or `undefined`, and a property is whatever was set, so the view checks what it gets.
- A computed value made from a prop keeps the view up to date as the page changes the prop.
