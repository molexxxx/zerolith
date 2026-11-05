# @zerolith/a11y

The accessibility primitives every component library rebuilds, as plain functions over the DOM with no dependency beyond `zerolith`.

```ts
import { html } from "zerolith";
import { createAnnouncer, focusTrap, rovingTabindex, visuallyHidden } from "@zerolith/a11y";

html`<div role="dialog" aria-modal="true" ref=${focusTrap()}>...</div>`;
html`<div role="tablist" ref=${rovingTabindex({ orientation: "horizontal" })}>...</div>`;
html`<span class=${visuallyHidden}>Opens in a new window</span>`;
createAnnouncer().announce("Saved");
```

- `focusTrap` keeps Tab inside an element, moves focus in on attach, and returns it on removal; on a native `<dialog>` it acts while the dialog is open.
- `inertOutside` makes everything outside an element inert, for a drawer or a menu, and returns what undoes it.
- `rovingTabindex` makes one item of a composite widget tabbable and moves between items with the arrow keys, Home, and End.
- `createAnnouncer` speaks messages through a live region.
- `focusOrigin` tells keyboard focus from pointer focus, as a signal and as a `data-focus-origin` attribute on the root element for styling.
- `visuallyHidden` is the clip pattern for text meant for assistive technology only.
- `mediaQuery`, `forcedColors`, and `reducedMotion` are media queries as signals.

The guide is on the [docs site](https://zerolith.dev/guide/accessibility/).

Install with `npm install @zerolith/a11y`. The API is frozen at 1.0 and supported for 24 months under the [support policy](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md).

## Documentation

- The [accessibility guide](https://zerolith.dev/guide/accessibility/) explains it with examples that run as tests.
- The [reference](https://zerolith.dev/reference/zerolith-a11y/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://zerolith.dev/learn/) builds an app step by step, and the [playground](https://zerolith.dev/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
