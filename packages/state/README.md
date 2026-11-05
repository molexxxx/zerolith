# @zerolith/state

Signals with a memory, over the core alone: a signal kept in storage and across tabs, undo and redo for a signal, debounced and throttled signals, and a selector that tells each row whether it is the selected one.

```ts
import { signal } from "zerolith";
import { debounced, history, selector, stored } from "@zerolith/state";

const theme = stored<"light" | "dark">("theme", "light");
const edits = history(signal(""));
const settledQuery = debounced(signal(""), 300);
const selected = selector(signal<number | null>(null));
```

- `stored` reads its value from storage as JSON, writes every set, and follows other tabs.
- `history` gives `checkpoint()`, `undo()`, and `redo()`, with `canUndo` and `canRedo` as signals.
- `debounced` and `throttled` follow a signal after a quiet spell or at most so often.
- `selector` gives each key a signal that is true for the selected one, so a selection among a thousand rows updates two.

The guide is on the [docs site](https://zerolith.dev/guide/state/).

Install with `npm install @zerolith/state`. The API is frozen at 1.0: a breaking change comes only in a major, after a deprecation notice, and the [support policy](https://github.com/molexxxx/zerolith/blob/main/docs/policy/support.md) says how long a line gets fixes.

## Documentation

- The [state guide](https://zerolith.dev/guide/state/) explains it with examples that run as tests.
- The [reference](https://zerolith.dev/reference/zerolith-state/) lists every export, generated from the source.
- New to zerolith? The [tutorial](https://zerolith.dev/learn/) builds an app step by step, and the [playground](https://zerolith.dev/playground/) runs code in the browser.

## License

Apache-2.0. See `LICENSE`.
