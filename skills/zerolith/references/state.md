<!-- Generated from docs/guide/state.md by npm run skills. Edit the guide, then regenerate. -->

# State

A signal holds one value for one page load. The things an application wants beyond that, a preference that survives a reload and shows the same in every tab, an undo button, a search that waits for the reader to stop typing, a selected row among a thousand, are each a small, well-known piece of work. `@zerolith/state` ships them as functions over signals, one form each, with nothing to configure:

| Function | For | Gives |
| --- | --- | --- |
| `stored(key, initial)` | A value kept across reloads and tabs | A writable signal kept in storage as JSON |
| `history(signal)` | Undo and redo | Checkpoints, `undo()`, `redo()`, and `canUndo` and `canRedo` as signals |
| `debounced(signal, ms)` | Work that waits for a quiet spell | A signal that follows the source after `ms` of quiet |
| `throttled(signal, ms)` | Work at a steady rate | A signal that follows the source at most once per `ms` |
| `selector(signal)` | A selection among many rows | A function from a key to a signal that is true for the selected key |

Install it with `npm install @zerolith/state`. It depends on `zerolith` alone.

## Kept in storage

`stored` reads its value from `localStorage` under the key when it is created, writes every set back as JSON, and sets itself again when another tab writes the key, so every tab shows the same value and a reload starts where the reader left off:

```ts
import { computed, html, render } from "zerolith";
import { stored } from "@zerolith/state";

const theme = stored<"light" | "dark">("theme", "light");
const other = computed(() => (theme.get() === "light" ? "dark" : "light"));

render(html`
    <button @click=${() => theme.set(other.get())}>Switch to ${other}</button>
    <p>The theme is ${theme}, in every tab, after every reload.</p>`, "#app");
```

A missing value takes the initial one quietly. A value that does not parse takes the initial one and reports `state_storage_unreadable`, since someone else wrote the key. Setting `undefined` removes the key, so it reads back as the initial value, and a value JSON cannot hold, such as a BigInt, stays in memory and reports `state_value_not_json`. Where the page has no storage, on the server or in a browser that refuses it, the signal is a plain one and `state_storage_unavailable` is reported once, as it is for each write the storage refuses. `{ storage: "session" }` keeps the value in `sessionStorage` instead, this tab's alone, and `{ equals }` is the signal's own equality.

Create each key once, at module level or in the app's root, and share the signal: two stored signals for one key in the same tab do not hear each other, since the storage event tells other tabs alone, and the second reports `state_key_duplicate`. The write and the listener for other tabs are disposed with the enclosing owner, as a component's effects are, after which the signal keeps its value in memory alone; created outside any owner, they live for the page.

## Undo and redo

`history` keeps checkpoints of a signal's value. Call `checkpoint()` before a change worth undoing, as an editor does before each edit; `undo()` sets the signal back to the last checkpoint and `redo()` brings the undone value back. A new checkpoint after an undo starts a new branch, as in most editors, so what was undone is gone:

```ts
import { computed, html, render, signal } from "zerolith";
import { history } from "@zerolith/state";

const text = signal("");
const edits = history(text);
const noUndo = computed(() => !edits.canUndo.get());
const noRedo = computed(() => !edits.canRedo.get());

function type(event: Event): void
{
    edits.checkpoint();
    text.set((event.currentTarget as HTMLTextAreaElement).value);
}

render(html`
    <textarea .value=${text} @input=${type}></textarea>
    <button ?disabled=${noUndo} @click=${edits.undo}>Undo</button>
    <button ?disabled=${noRedo} @click=${edits.redo}>Redo</button>`, "#app");
```

`canUndo` and `canRedo` are signals, so a button follows them. Fifty checkpoints are kept, the oldest dropped when one more is saved; `{ limit }` sets the number. `dispose()` forgets them all and leaves the signal as it is.

## After a quiet spell, or at most so often

`debounced` gives a signal that follows its source once the source has been quiet for the given time, so a search runs for the text the reader stopped typing rather than for each keystroke. `throttled` gives one that follows at most once per window: the first change in a window shows at once and the last one in it shows when the window ends, so a scroll position drives work at a steady rate:

```ts
import { html, render, signal } from "zerolith";
import { debounced, throttled } from "@zerolith/state";

const query = signal("");
const settledQuery = debounced(query, 300);
const scrollTop = signal(0);
const steadyScroll = throttled(scrollTop, 100);

function search(event: Event): void
{
    query.set((event.currentTarget as HTMLInputElement).value);
}

render(html`
    <input @input=${search}>
    <p>Searching for ${settledQuery}</p>
    <p>Scrolled to ${steadyScroll}</p>`, "#app");
```

Both start at the source's current value, and a change still pending when the enclosing owner is disposed is dropped.

## A selection among many

A list that binds `selectedId.get() === row.id` in every row runs every row's comparison on each selection. `selector` turns the selected value into one signal per key, true for the selected key, and a change of the selection updates the two keys concerned alone:

```ts
import { computed, html, render, signal } from "zerolith";
import { selector } from "@zerolith/state";

const rows = [
    { id: 1, label: "one" },
    { id: 2, label: "two" },
    { id: 3, label: "three" }
];
const selectedId = signal<number | null>(null);
const selected = selector(selectedId);

render(html`
    <ul>${rows.map((row) => html`
        <li class=${computed(() => (selected(row.id).get() ? "selected" : ""))}
            @click=${() => selectedId.set(row.id)}>${row.label}</li>`)}
    </ul>`, "#app");
```

Keys are compared as `Map` keys are. A key's signal is shared by everyone who asks for it, and the selector keeps no hold of its own: the signal lives while a view reads it and goes with the row that did, so a list that scrolls through many keys holds the signals of the rows on screen.
