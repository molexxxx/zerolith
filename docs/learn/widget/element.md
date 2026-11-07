---
title: Define the element
description: Register feedback-widget with define from zerolith/element, render a form inside it, and serve a development page that holds it.
order: 1
---

# Define the element

A page built with React, Vue, WordPress, or plain HTML has one thing in common: it can hold an element. A custom element is an HTML element whose behavior a script defines, so once the script has run, `<feedback-widget>` works in any of those pages the way `<details>` or `<video>` does, and the page needs to know nothing about how it was built.

`define`, from `zerolith/element`, registers a custom element whose content is a zerolith view.

## The form

Create `src/components/feedback.ts`:

@include packages/zerolith/test/fixtures/widget/element/src/components/feedback.ts

It is a native form: a fieldset whose legend asks the question, two radio buttons, a comment field, and a submit button, each with a label, so it works with the keyboard and with assistive technology from the start. `required` on the first radio button makes the browser ask for an answer before it submits, and `maxlength` keeps the comment to the 1000 characters the backend will accept.

## The element

Replace `src/main.ts`:

@include packages/zerolith/test/fixtures/widget/element/src/main.ts

`define` takes the element's name and two options: `props`, the attributes and properties the element follows, none yet, and `view`, the function that returns its content. A custom element's name must contain a hyphen, which keeps it apart from every element HTML has now or will add later; `define("feedback", ...)` throws.

When the element joins the page, zerolith renders the view into it, and when it leaves, the view is disposed with everything it set up; added again, it renders again. The form lives in the element's own children, in the page's DOM, with no shadow root, as every zerolith view does. The [styles step](styles.md) shows what that means for the widget's styles and the page's.

## The development page

The starter's `index.html` becomes the page you develop the widget on: a stand-in for a page of a site that embeds it. Replace `index.html`:

@include packages/zerolith/test/fixtures/widget/element/index.html

and `src/styles.css`, the page's own styles:

@include packages/zerolith/test/fixtures/widget/element/src/styles.css

The page loads one script, `src/main.ts`, as a host page will. Start the dev server:

```sh
npm run dev
```

Open the address it prints, http://127.0.0.1:8080/ unless that port is taken, and the form appears under the article. Pressing Send without an answer makes the browser ask for one. With an answer, the browser submits the form as it does any form without an action or a handler: a GET to the same page, which reloads it with the answer in the address. Step 4 sends it to a backend instead.

## What you learned

- A custom element works in any page, whatever built it, once its script has run.
- `define` from `zerolith/element` registers an element whose content is a zerolith view.
- The view renders into the element's own children when it joins the page, and is disposed when it leaves.
