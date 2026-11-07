<!-- Generated from docs/guide/elements.md by npm run skills. Edit the guide, then regenerate. -->

# Custom elements

Replacing an application in one step freezes product work; replacing it one view at a time does not. `define`, from `zerolith/element`, registers a custom element whose content is a zerolith view and whose attributes and properties are signals, so the new view sits inside an existing React, Vue, Angular, or server-rendered page until the tree around it is ready to move.

## Define an element

```ts
import { computed, html } from "zerolith";
import { define } from "zerolith/element";

define("note-count", {
    props: ["label", "count"],
    view: ({ label, count }, element) =>
    {
        const total = computed(() => Number(count.get() ?? 0));
        const reset = () =>
            element.dispatchEvent(new CustomEvent("reset", { bubbles: true }));
        return html`
            <span>${label}: ${total}</span>
            <button @click=${reset}>Reset</button>`;
    }
});
```

Each declared prop is observed as an attribute and exposed as a property, and both feed the same signal, which the view receives by name:

| Set by | The signal holds |
| --- | --- |
| An attribute, as `count="2"` | The string, or `undefined` once the attribute is removed |
| A property, as `element.count = 5` | Whatever was assigned, with its type |
| A property assigned before the element was defined | That value, kept when the element upgrades |

The view's second argument is the host element, for what a boundary needs, such as dispatching the events the outer framework listens to.

> [!TIP]
> Name props in lowercase. HTML lowercases attribute names, so a camelCase prop such as `maxCount` is reachable as a property but never as an attribute.

A prop named like a property every element has, such as `title`, `hidden`, or `id`, replaces that property on the element: the attribute still feeds the signal, and assigning the property writes the signal instead of the native value, so the browser no longer reflects it to the attribute. Choose another name where the native behavior matters.

## Its life on the page

| When | What happens |
| --- | --- |
| The element connects | The view renders into it in place of whatever it held, or hydrates the markup it already holds from the server |
| An attribute or a property changes | Its signal updates, and only the bindings that read it change |
| The element disconnects | The view is disposed with the effects and `onDispose` cleanups it registered |
| It connects again, as when it moves | The view renders again, with the props it had |
| `define` runs on the server, with no `customElements` | Nothing is registered |
| `define` runs again for the same name | Nothing happens, so hot replacement can run the module again |

The content lives in light DOM, as every zerolith view does, so scoped styles, design tokens, and global stylesheets apply unchanged, and there is no shadow root to pierce.

Text inside the tag is what a visitor sees until the script loads, as a fallback, and the view replaces it. The view can read it from the host as it runs, for a label the page chose, and a view that throws leaves it in place:

```html
<note-count label="Drafts" count="2">Loading the count</note-count>
```

An element inside another component's shadow root still gets its scoped styles, because the shadow root adopts them when the view renders there, including stylesheets created later. Global stylesheets stop at that shadow root, as they do for any element.

## Use it anywhere

In any HTML, or in the markup of a React, Vue, or Angular component:

```html
<note-count label="Drafts" count="2"></note-count>
```

From script, its properties and events work like any element's:

```ts
type NoteCount = HTMLElement & { count: number };

const counter = document.querySelector("note-count") as NoteCount;
counter.count = 5;                      // a property keeps its type
counter.addEventListener("reset", () =>
{
    counter.count = 0;
});
```

React 19 and Vue set a property when the element defines one and an attribute otherwise, and an Angular property binding such as `[count]` sets the property, so each framework reaches the same signal through the path it prefers.

## Coexisting with another framework

The element is the boundary, and nothing inside it knows about the framework outside. Data crosses it the way it crosses a native element:

| Direction | How |
| --- | --- |
| Into the view | Attributes and properties, which arrive as the prop signals |
| Out of the view | Events dispatched from the host element, which the outer framework listens to |
| Shared by both sides | A signal in a module both import: the outer application writes it wherever its own state changes, and the view reads it |

The old application can then be retired one element at a time, while `zerolith dev` or Vite serves both.
