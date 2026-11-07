---
title: Define the element
description: Register feedback-widget with define from zerolith/element, render a form inside it, and serve a development page that holds it.
order: 1
---

# Define the element

Pages built with React, Vue, WordPress, or plain HTML all have one thing in common: they can hold HTML elements. A **custom element** is an HTML element whose behavior comes from a script. Once the script has run, `<feedback-widget>` works on any of those pages, just like `<details>` or `<video>`. The page doesn't need to know how the widget was built.

`define`, from `zerolith/element`, creates a custom element whose content is a zerolith view.

## The form

Create `src/components/feedback.ts`:

@include packages/zerolith/test/fixtures/widget/element/src/components/feedback.ts

It's a plain HTML form:

- a `fieldset` whose `legend` asks the question
- two radio buttons, Yes and No
- a comment field
- a Send button

Each control has a label, so the form works with the keyboard and with screen readers from the start. `required` on the first radio button makes the browser ask for an answer before it sends. `maxlength` keeps the comment to 1000 characters, the most the server will accept.

## The element

Replace `src/main.ts`:

@include packages/zerolith/test/fixtures/widget/element/src/main.ts

`define` takes the element's name and two options:

- **`props`**: the attributes and properties the element listens to. There are none yet.
- **`view`**: the function that returns the element's content.

A custom element's name must have a hyphen in it. That keeps it apart from every element HTML has now or will add later. `define("feedback", ...)` throws an error.

When the element is added to a page, zerolith shows the view inside it. When it's removed, the view is cleaned up along with everything it set up. If it's added again, the view shows again. The form lives inside the element as normal HTML, like every zerolith view. The [styles step](styles.md) explains what that means for styling.

## The development page

The starter's `index.html` becomes the page you develop the widget on. It stands in for a page on someone else's site. Replace `index.html`:

@include packages/zerolith/test/fixtures/widget/element/index.html

Then replace `src/styles.css`, the page's own styles:

@include packages/zerolith/test/fixtures/widget/element/src/styles.css

The page loads one script, `src/main.ts`, just as a real site will. Start the dev server:

```sh
npm run dev
```

## Try it

Open the address it prints, usually `http://127.0.0.1:8080/`. The form appears under the article.

1. Press **Send** without an answer. The browser asks you to pick one.
2. Pick an answer and press **Send**. The browser sends the form the way it sends any form without an `action`: it reloads the page with your answer in the address. Step 4 sends it to a server instead.

## What you learned

- A custom element works on any page, whatever built it, once its script has run.
- `define` from `zerolith/element` creates an element whose content is a zerolith view.
- The view appears inside the element when it's added to a page, and is cleaned up when it's removed.
