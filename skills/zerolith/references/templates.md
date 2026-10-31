<!-- Generated from docs/guide/templates.md by npm run skills. Edit the guide, then regenerate. -->

# Templates

`html` is a tagged template. The static parts are parsed once into a template element; each expression becomes a part bound to one node. A signal in a part subscribes that part alone, so an update touches one text node or attribute and the component function never runs again.

## Bindings

| Form | Meaning |
| --- | --- |
| `${value}` as content | Text, a number, a signal, another template, a node, or an iterable of those. `null`, `undefined`, and booleans render nothing. |
| `name=${value}` | An attribute. `null` or `undefined` removes it. Several expressions can share one attribute value. |
| `?name=${flag}` | A boolean attribute, present when the flag is truthy. |
| `.name=${value}` | A property on the element, such as `.value` on an input. |
| `@name=${handler}` | An event listener: a function, or an object with `handleEvent` and optional `capture`, `passive`, `once`. |
| `ref=${target}` | Hands the element to a writable signal or a callback. |

```ts
import { html, render, signal } from "zerolith";

const name = signal("");
const tone = signal("quiet");
const saving = signal(false);
const field = signal<HTMLInputElement | undefined>(undefined);
const typed = (event: Event) => name.set((event.target as HTMLInputElement).value);

render(html`
    <label>Name
        <input ref=${field} placeholder=${"Ada"} ?disabled=${saving}
            .value=${name} @input=${typed}>
    </label>
    <p class="greeting ${tone}">Hello ${name}</p>`, "#app");

field.get()?.focus();                   // the ref handed over the element
name.set("<b>Ada</b>");                 // shown as text in both places
saving.set(true);                       // adds the disabled attribute
```

Values are inserted as text. Markup in a string is never parsed, so there is nothing to escape by hand.

## Lists

`each` renders one row per item, keyed. Rows whose key survives are updated in place through an item signal, and reordering moves the fewest nodes.

```ts
import { computed, each, html, render, signal } from "zerolith";

interface Task
{
    id: number;
    text: string;
}
const tasks = signal<Task[]>([{ id: 1, text: "write" }, { id: 2, text: "test" }]);

render(html`
    <ul>
        ${each(tasks, (task) => task.id, (task) => html`
            <li>${computed(() => task.get().text)}</li>`)}
    </ul>`, "#app");

// The row with id 1 moves to the end, keeps its element, and updates its text:
tasks.set([{ id: 2, text: "test" }, { id: 1, text: "write, edited" }]);
```

A key must be unique and defined; otherwise the render fails with `each_key_duplicate` or `each_key_undefined`.

## Conditions

`when` creates a branch lazily, disposes it when hidden, and ignores changes that keep the same truthiness.

```ts
import { html, render, signal, when } from "zerolith";

const user = signal<string | null>(null);

render(html`
    <header>
        ${when(user,
            () => html`<p>Hello ${user}</p>`,
            () => html`<a href="/sign-in">Sign in</a>`)}
    </header>`, "#app");

user.set("Ada");                        // swaps the link for the greeting
```

## The same component in JSX

With a build step, the same template can be spelled as JSX in a `.jsx` or `.tsx` file. It is a spelling, not a second runtime: the Vite plugin lowers each JSX expression to the `html` call it stands for before any other transform runs, components stay the functions they are in a `.ts` file, and the rules above hold unchanged, including the one about binding the signal rather than its value.

```tsx
import { type View, computed, each, render, signal } from "zerolith";

function Counter({ start, label }: { start: number; label: string }): View
{
    const count = signal(start, { name: "count" });
    return (
        <button on:click={() => count.set(count.get() + 1)}>
            {label}: {count}
        </button>
    );
}

function App(): View
{
    const items = signal(["one", "two"]);
    const pending = signal(false);
    return (
        <main class="app">
            <h1>Hello {computed(() => items.get().length)} items</h1>
            <input prop:value={signal("typed")} bool:disabled={pending} />
            <ul>{each(items, (item) => item, (item) => <li>{item}</li>)}</ul>
            <Counter start={2} label="Clicks" />
        </main>
    );
}

render(<App />, "#app");
```

| JSX | Template |
| --- | --- |
| `class="app"` | `class="app"`, static markup |
| `id={value}` | `id=${value}` |
| `prop:value={signal}` | `.value=${signal}` |
| `on:click={handler}` | `@click=${handler}` |
| `bool:disabled={flag}` | `?disabled=${flag}` |
| `ref={target}` | `ref=${target}` |
| `<Counter start={2}>child</Counter>` | `${Counter({ start: 2, children: "child" })}` |
| `<>...</>` | a template with no root element |

Lists and conditions are `each` and `when`, called as functions, exactly as in a template; there is no `<For>` or `<Show>`. Spread attributes on an element are refused, because a template cannot express an unknown set of attributes; spread onto a component is plain object spread. A `tsconfig` with `"jsx": "react-jsx"` and `"jsxImportSource": "zerolith"` types the elements and the namespaces. Without a build step, write `html`; JSX never runs in the browser.

## Raw markup

`unsafeHtml` is the one way to insert markup without escaping, for content you already trust, such as HTML rendered from Markdown you wrote. Never pass user input to it.

## What the renderer refuses

These fail with a coded error before anything reaches the DOM:

- A `<script>` element inside a template (`script_in_template`).
- An expression inside a comment, a tag name, an attribute name, or a raw-text element such as `<style>` or `<textarea>` (`binding_in_comment`, `binding_in_tag_position`, `binding_in_raw_text`).
- `.innerHTML`, `.outerHTML`, `srcdoc`, and `on*` attribute bindings (`unsafe_property_binding`, `unsafe_attribute_binding`).
- A function or a plain object as content (`unrenderable_value`), which is usually a component passed instead of called.
- A non-function event handler (`event_handler_not_function`).

A `javascript:` or `vbscript:` URL, or a non-image `data:` URL, in `href`, `src`, `action`, `formaction`, or `poster` is removed and reported as `unsafe_url_blocked`.
