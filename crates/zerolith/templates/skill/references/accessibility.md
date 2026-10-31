<!-- Generated from docs/guide/accessibility.md by npm run skills. Edit the guide, then regenerate. -->

# Accessibility

A framework cannot make an application accessible, but it can refuse to leave the hard parts to each project. `@zerolith/a11y` ships the pieces that Angular CDK exposes and React Aria is built on, as plain functions over the DOM with no dependency beyond `zerolith`. Most of them are `ref` callbacks: they attach when the element is created and clean up when its template is removed, so there is nothing to remember to tear down. `@zerolith/test` checks the defects a test can see; the guide on [testing](testing.md) covers it.

## Dialogs: focus trap

A modal dialog must take focus when it opens, keep Tab inside, and give focus back when it closes. `focusTrap` does all three from one `ref`.

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

By default focus lands on the first focusable element inside, or on the element itself; `initial` names another target or `false` to leave focus alone, and `restore: false` keeps focus where it is on removal. Focus that lands outside, by script or by a click, is pulled back in.

## Composite widgets: roving tabindex

Tabs, menus, listboxes, radio groups, and trees are one Tab stop with arrow keys inside. `rovingTabindex` keeps exactly one item in the Tab order, moves between items with the arrow keys, Home, and End, follows the item that is selected or checked, and picks up items added later.

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

`orientation` chooses which arrow keys move, `loop` wraps at the ends, and `items` replaces the default selector of ARIA roles with your own.

## Announcements and hidden text

`createAnnouncer` writes messages into live regions that assistive technology reads without moving focus; `assertive` interrupts, `polite` waits. `visuallyHidden` is the clip pattern for text that only assistive technology should get.

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

## Focus origin

Focus rings belong on keyboard focus and are noise on pointer focus. `focusOrigin` watches how focus arrives and exposes it as a signal and as a `data-focus-origin` attribute on the root element, so one stylesheet rule does the rest:

```css
[data-focus-origin="keyboard"] :focus { outline: 2px solid var(--accent); }
```

## Preferences

`mediaQuery` turns a media query into a signal; `forcedColors` and `reducedMotion` wrap the two every interface should follow. Both are false on the server.

```ts
import { reducedMotion } from "@zerolith/a11y";

const calm = reducedMotion();
const duration = () => (calm.get() ? 0 : 200);
```
