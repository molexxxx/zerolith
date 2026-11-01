<!-- Generated from docs/guide/accessibility.md by npm run skills. Edit the guide, then regenerate. -->

# Accessibility

A framework cannot make an application accessible, but it can refuse to leave the hard parts to each project. `@zerolith/a11y` ships the pieces that Angular CDK exposes and React Aria is built on, as plain functions over the DOM with no dependency beyond `zerolith`:

| Primitive | For | How it is used |
| --- | --- | --- |
| `focusTrap()` | Modal dialogs | A `ref` on the dialog |
| `rovingTabindex()` | Tabs, menus, listboxes, radio groups, trees, and grids | A `ref` on the container |
| `createAnnouncer()` | Messages read aloud without moving focus | Call `announce` |
| `visuallyHidden` | Text that only assistive technology reads | Bound as a `class` |
| `focusOrigin()` | Focus rings for keyboard users only | Called once, then styled by an attribute |
| `mediaQuery()`, `forcedColors()`, `reducedMotion()` | The user's preferences | Read as signals |

The two `ref` primitives attach when the element is created and clean up when its template is removed, so there is nothing to remember to tear down. `@zerolith/test` checks the defects a test can see; the [testing guide](testing.md) covers it.

## Dialogs: focus trap

A modal dialog must take focus when it opens, keep Tab inside, and give focus back when it closes. `focusTrap` does all three from one `ref`:

```ts
import { html, render, signal, when } from "zerolith";
import { focusTrap } from "@zerolith/a11y";

const open = signal(false);

render(html`
    <button @click=${() => open.set(true)}>Delete note</button>
    ${when(open, () => html`
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-title"
            ref=${focusTrap()}>
            <h2 id="confirm-title">Delete the note?</h2>
            <button @click=${() => open.set(false)}>Cancel</button>
            <button>Delete</button>
        </div>`)}`, "#app");
```

Focus that lands outside the dialog, by script or by a click, is pulled back in. When a dialog opens another, such as a confirmation, only the newest trap acts; closing it hands focus and control back to the dialog below.

| Option | Default | What it does |
| --- | --- | --- |
| `initial` | The first focusable element inside, or the dialog itself | Where focus goes on open: a selector inside the dialog, an element, or `false` to leave focus alone |
| `restore` | `true` | Returns focus to the element that had it before the dialog opened |

## Composite widgets: roving tabindex

Tabs, menus, listboxes, radio groups, and trees are one Tab stop with arrow keys inside. `rovingTabindex` keeps exactly one item in the Tab order, moves between items with the arrow keys, Home, and End, starts on the item that is selected or checked, skips disabled items and the ones that are hidden or inert, such as the children of a collapsed tree item, and picks up items added later:

```ts
import { html, render } from "zerolith";
import { rovingTabindex } from "@zerolith/a11y";

render(html`
    <div role="tablist" aria-label="Guides"
        ref=${rovingTabindex({ orientation: "horizontal" })}>
        <button role="tab" aria-selected="true">Signals</button>
        <button role="tab" aria-selected="false">Templates</button>
        <button role="tab" aria-selected="false">Routing</button>
    </div>`, "#app");
```

| Option | Default | What it does |
| --- | --- | --- |
| `orientation` | `"both"` | Which arrow keys move: `"horizontal"` for left and right, `"vertical"` for up and down |
| `loop` | `true` | Wraps from the last item to the first and back |
| `items` | The composite ARIA roles, such as `tab`, `option`, and `menuitem`, and `[data-roving]` | The selector of the items |

## Announcements and hidden text

`createAnnouncer` adds two live regions to the page, hidden visually, which assistive technology reads without moving focus. `announce(message)` is polite and waits for the reader to finish; `announce(message, "assertive")` interrupts. Each announcement clears its region first, so the same message announced twice is read twice. `visuallyHidden` is the clip pattern for text that only assistive technology should get:

```ts
import { html, render } from "zerolith";
import { createAnnouncer, visuallyHidden } from "@zerolith/a11y";

const announcer = createAnnouncer();

render(html`
    <a href="/report" target="_blank">
        Report <span class=${visuallyHidden}>(opens in a new window)</span>
    </a>`, "#app");
announcer.announce("Report saved");
```

> [!TIP]
> Announce what changed out of sight: an item saved, a filter that left no results, an upload that finished. A change the reader caused and can already see, such as text they typed, needs no announcement.

## Focus origin

Focus rings belong on keyboard focus and are noise on pointer focus. `focusOrigin` watches how focus arrives and exposes it as a signal, `origin`, and as a `data-focus-origin` attribute on the root element, so one stylesheet rule does the rest:

```css
[data-focus-origin="keyboard"] :focus { outline: 2px solid var(--accent); }
```

| Origin | When |
| --- | --- |
| `"keyboard"` | A key was pressed before focus moved |
| `"pointer"` | A mouse or a pen was pressed |
| `"touch"` | A finger touched the screen |
| `"program"` | Anything else, such as `element.focus()` from script |
| `null` | Nothing in the document has focus |

Call it once, in `main.ts`; `dispose()` removes its listeners and the attribute.

## Preferences

`mediaQuery` turns a media query into a signal that follows its matches. `forcedColors` and `reducedMotion` wrap the two every interface should follow: forced colors, such as Windows high contrast, where the system replaces author colors, and a request for less motion.

```ts
import { reducedMotion } from "@zerolith/a11y";

const calm = reducedMotion();
const duration = () => (calm.get() ? 0 : 200);
```

Each is `false` wherever `matchMedia` does not exist, such as on the server, so a server-rendered page starts with motion and author colors and the browser corrects it once it hydrates.
