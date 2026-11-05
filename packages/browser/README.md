# @zerolith/browser

The page as signals: whether it is online and visible and the window's size, one signal each for the page, and an element's content box and whether it is in view, one per element, kept by observers that go with the enclosing owner.

```ts
import { computed, html, signal } from "zerolith";
import { inView, online, size, windowSize } from "@zerolith/browser";

const status = computed(() => (online().get() ? "Online" : "Offline"));
const wide = computed(() => windowSize().get().width >= 960);

function Panel()
{
    const root = signal<Element | undefined>(undefined);
    const box = size(root);
    const near = inView(root, { rootMargin: "200px" });
    return html`<section ref=${root}>${computed(() => box.get().width)}px wide</section>`;
}
```

- `online()`, `visible()`, and `windowSize()` follow the browser's events and are shared by the page.
- `size(target)` and `inView(target, options?)` take an element or the signal a `ref` fills.
- Each is still on the server: online, visible, and no size.

The guide is on the [docs site](https://zerolith.dev/guide/browser/).

Install with `npm install @zerolith/browser`. The API is frozen at 1.0: a breaking change comes only in a major, after a deprecation notice, and the [support policy](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md) says how long a line gets fixes.

## Documentation

- The [browser guide](https://zerolith.dev/guide/browser/) explains it with examples that run as tests.
- The [reference](https://zerolith.dev/reference/zerolith-browser/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://zerolith.dev/learn/) builds an app step by step, and the [playground](https://zerolith.dev/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
