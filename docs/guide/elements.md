---
title: Custom elements
description: Mount a zerolith view inside a page or a tree another framework owns, through a custom element whose attributes and properties are signals.
order: 15
---

# Custom elements

Replacing an application in one step freezes product work; replacing it one view at a time does not. `define`, from `zerolith/element`, registers a custom element whose content is a zerolith view and whose attributes and properties are signals, so the new view sits inside an existing React, Vue, Angular, or server-rendered page until the tree around it is ready to move.

## Define an element

@include packages/zerolith/test/examples/element.example.browser.test.ts#define

Each declared prop is observed as an attribute and exposed as a property, both feeding the same signal: an attribute arrives as a string or `undefined`, a property keeps whatever was assigned, and a value set before the element was upgraded is kept. The view receives the host element for the things a boundary needs, such as dispatching events the outer framework listens to.

## Use it anywhere

In any HTML, or in the markup of a React, Vue, or Angular component:

```html
<note-count label="Drafts" count="2"></note-count>
```

From script, its properties and events work like any element's:

@include packages/zerolith/test/examples/element.example.browser.test.ts#use

React 19, Vue, and Angular set a property when the element has one and an attribute otherwise, which is why both paths exist. The content is rendered when the element connects, hydrated when it already holds server-rendered markup, and disposed when it disconnects. It lives in light DOM, as every zerolith view does, so scoped styles, design tokens, and global stylesheets apply unchanged and there is no shadow root to pierce.

## Coexisting with another framework

The element is the boundary; nothing inside it knows about the framework outside. State flows in through props and out through events, the same contract a native element offers. Shared state that both sides own, a store the old application keeps, is bridged by writing it into a signal from the outside and reading the signal inside, and the old application can be retired one element at a time while `zerolith dev` or Vite serves both.
