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

- `focusTrap` keeps Tab inside an element, moves focus in on attach, and returns it on removal.
- `rovingTabindex` makes one item of a composite widget tabbable and moves between items with the arrow keys, Home, and End.
- `createAnnouncer` speaks messages through a live region.
- `focusOrigin` tells keyboard focus from pointer focus, as a signal and as a `data-focus-origin` attribute on the root element for styling.
- `visuallyHidden` is the clip pattern for text meant for assistive technology only.
- `mediaQuery`, `forcedColors`, and `reducedMotion` are media queries as signals.

The guide is `docs/guide/accessibility.md` in the repository.

Status: alpha. Install with `npm install @zerolith/a11y@alpha`; the API may change before 1.0.

## License

Apache-2.0. See `LICENSE`.
