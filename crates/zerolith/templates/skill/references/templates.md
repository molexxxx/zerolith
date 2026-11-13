<!-- Generated from docs/guide/templates.md by npm run skills. Edit the guide, then regenerate. -->

# Templates

A template describes a piece of the page. It is plain HTML written in a JavaScript tagged template, `` html`...` ``, and every `${...}` in it is a place the page changes: a text, an attribute, a list, or another template.

Three facts explain how zerolith renders one, and the rest of this guide follows from them:

1. **The markup is parsed once.** The first time a template runs, the browser parses its static HTML into a template element, and zerolith remembers where each `${...}` sits. Every later use clones that parsed copy, so a template costs one parse however many times it renders.
2. **Each expression becomes a part bound to one node.** The text after `Hello ` is one text node; a `class=${tone}` is one attribute. A part knows only its own node.
3. **A signal updates its part and nothing else.** When a signal in a part changes, that part writes its node directly. The component that built the template does not run again, and nothing is compared against a previous render, because there is no previous render to compare.

A complete component reads like this:

```ts
import { computed, html, render, signal } from "zerolith";

function Counter({ start = 0 }: { start?: number })
{
    const count = signal(start);
    const doubled = computed(() => count.get() * 2);
    return html`
        <section>
            <p>Count: ${count}, doubled: ${doubled}</p>
            <button @click=${() => count.set(count.get() + 1)}>Add one</button>
        </section>`;
}

render(Counter({ start: 1 }), "#app");
```

Clicking the button sets `count`, which rewrites two text nodes: the count and the doubled value. `Counter()` ran once, before `render` received its view, and never runs again. Passing a function that returns the view, as in `render(() => Counter({ start: 1 }), "#app")`, runs the component inside the root instead, so the effects and `onDispose` cleanups it registers end with `dispose()`; the starter mounts its application this way.

> [!IMPORTANT]
> Bind the signal, not its value. `${count}` hands the signal itself to the part, which subscribes to it and stays in step. `${count.get()}` reads the number once, at render time, and the page never sees a later value. The Vite plugin and the command line warn about it as `template_frozen_read`.

```ts
import { html, render, signal } from "zerolith";

const count = signal(1);

render(html`
    <p class="live">${count}</p>
    <p class="frozen">${count.get()}</p>`, "#app");

// The first paragraph now shows 2; the second still shows 1.
count.set(2);
```

Call `.get()` where code needs the value at that moment: inside `computed`, `effect`, the `params` of a `resource`, and event handlers, such as the button's handler above, which reads the count to add one to it.

## Components

A component is a plain function that takes one object of props and returns a view. There is no class, no hook rule, and no lifecycle to learn: the function runs once, builds its template, and from then on its signals keep the page current.

```ts
import { type ReadableSignal, html, render, signal } from "zerolith";

function Badge({ count }: { count: ReadableSignal<number> })
{
    return html`<span class="badge">${count}</span>`;
}

function Panel({ title, children }: { title: string; children: unknown })
{
    return html`
        <section>
            <h2>${title}</h2>
            ${children}
        </section>`;
}

const unread = signal(3);
const inbox = Panel({
    title: "Inbox",
    children: html`<p>Unread: ${Badge({ count: unread })}</p>`
});

render(inbox, "#app");

// The badge now shows 4, and neither Panel nor Badge runs again.
unread.set(4);
```

- **Props are a plain object.** A prop that should stay live is passed as a signal, as `count` is to `Badge`; a prop passed as a value is fixed for that use of the component.
- **Children are a prop.** Whatever a parent passes as `children` renders where the component places it, as `Panel` places its paragraph.
- **A component is called, not mounted.** `Badge({ count: unread })` returns the view to put in the template. Passing `Badge` itself, uncalled, fails with `unrenderable_value`.
- **State belongs where it is created.** A signal created inside a component lives as long as the component's view; one created in a module, as `count` in the counter above, is shared by everything that imports it. The [signals guide](signals.md) covers ownership and cleanup.

## Values a subtree shares

A value that many components need, such as the signed-in user or the theme, can skip the props of every level in between. `context` makes a place for it with a value to start from, `provide` gives it another value for everything a function creates, and `read` takes the nearest one back out.

```ts
import { context, html, render } from "zerolith";

const Theme = context<"light" | "dark">("light");

function SaveButton()
{
    return html`<button class=${Theme.read()}>Save</button>`;
}

function Toolbar()
{
    return html`<nav>${SaveButton()}</nav>`;
}

render(() => Theme.provide("dark", () => Toolbar()), "#app");
```

- **Read it while the component runs**, as `SaveButton` does, the way props are read. What the component creates keeps the value it was created under: the rows `each` adds later, the branches `when` shows later, effects, computed values, and the pages the router's outlet shows. An event handler, a timer, or the code after an `await` runs outside the component, so read the value first and keep it.
- **A provided value is fixed.** To give a subtree something that changes, provide a signal and bind it.
- **Outside every `provide`, `read` returns the value the context started with.** On the server, each `renderToString` call can provide its own request's values, which a signal in a module, shared by every request, cannot.

## Bindings

Where an expression sits in the markup decides what it binds to:

| Form | Binds | With `null` or `undefined` |
| --- | --- | --- |
| `${value}` as content | Text, a number, a signal, another template, a node, or a list of those. Booleans render nothing. | Renders nothing |
| `name=${value}` | An attribute. Several expressions can share one value, as in `class="card ${tone}"`. | Removes the attribute |
| `?name=${flag}` | A boolean attribute, present while the flag is truthy. | Removes the attribute |
| `.name=${value}` | A property of the element, such as `.value` on an input. | Assigns it to the property |
| `@name=${handler}` | An event listener added to the element itself, so `event.currentTarget` is that element and the event reaches it as it would any listener: a function, or an object with `handleEvent` and optional `capture`, `passive`, and `once`. | Adds no listener |
| `ref=${target}` | Hands the element to a callback, or to a writable signal, which goes back to `undefined` when the element is removed; `null` or `undefined` hands it to nothing. | Fails with `ref_not_assignable` for any other value |

Content, attributes, boolean attributes, and properties take a plain value or a signal, and a signal keeps them live. An event binding takes the handler itself, and a ref takes the callback or signal that receives the element.

```ts
import { html, render, signal } from "zerolith";

const name = signal("");
const tone = signal("quiet");
const saving = signal(false);
const field = signal<HTMLInputElement | undefined>(undefined);
const typed = (event: Event) =>
    name.set((event.target as HTMLInputElement).value);

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

Values are always inserted as text. `<b>Ada</b>` above shows as those characters, not as bold text, in both the input and the paragraph, so there is nothing to escape by hand and no way for data to turn into markup by accident.

A `ref` runs when the element is created, before its template is in the document, as Solid's refs do. Measuring the element or moving focus into it waits a microtask, by which time the template has been inserted; `focusTrap` from `@zerolith/a11y` waits that way.

Each content binding is a text node of its own, and a browser kerns within one text node, not across two, so two bindings in one run of text, as `${first}${last}`, can set the glyphs at the seam a fraction of a pixel apart from the same text written once. Where that shows, bind the run as one value, as `${computed(() => first.get() + last.get())}`.

Markup the page already holds, such as a server-written header that stays as it is for a reader without JavaScript, has no template to bind. An effect that writes to the elements in the page gives it the same live behavior:

```js
const menu = document.querySelector(".menu-toggle");
effect(() => menu?.setAttribute("aria-expanded", String(open.get())));
```

## Lists

`each` renders one row per item of an array or a signal of an array. It takes three things: the items, a key function that names each row, and a row function that builds it.

```ts
import { computed, each, html, render, signal } from "zerolith";

interface Task
{
    id: number;
    text: string;
}
const tasks = signal<Task[]>([
    { id: 1, text: "write" },
    { id: 2, text: "test" }
]);

render(html`
    <ul>
        ${each(tasks, (task) => task.id, (task) => html`
            <li>${computed(() => task.get().text)}</li>`)}
    </ul>`, "#app");

// The row with id 1 moves to the end, keeps its element, and updates its text:
tasks.set([{ id: 2, text: "test" }, { id: 1, text: "write, edited" }]);
```

When the array changes, rows are matched by key, not by position:

- A row whose key is still present keeps its elements. Its item signal receives the new item, so only the bindings that read a changed field update; `write, edited` above changed one text node.
- A row whose key is gone is removed, and its effects stop.
- Rows that changed places move, and the fewest nodes move that can bring the list into the new order.

The row function receives the item as a signal, and, when it declares a second parameter, the row's position as a signal that follows its moves; a row function without that parameter skips creating it.

> [!TIP]
> A row's key never changes, so the row function can read it once at its top, as `const { id } = item.get();`, and use `id` as a plain value. Every other field stays a binding of the item signal, so an edit to it reaches the page.

> [!WARNING]
> Keys must be unique and defined. A repeated key fails the render with `each_key_duplicate` and a missing one with `each_key_undefined`, rather than quietly showing the wrong row. An update that fails this way changes no row, so the list shows the last list it accepted until a valid one arrives.

### A list edited a row at a time

Setting a new array suits a list that arrives whole, as from a fetch: matching the keys costs one comparison per row. When rows change one at a time, as tasks checked off, a row can hold the fields that change in signals of its own. An edit writes them, the list keeps its array, and only that row's bindings update:

```ts
import {
    type Signal, batch, computed, each, html, render, signal
} from "zerolith";

interface Task
{
    id: number;
    text: Signal<string>;
    done: Signal<boolean>;
}
const tasks = signal<Task[]>([
    { id: 1, text: signal("write"), done: signal(false) },
    { id: 2, text: signal("test"), done: signal(false) }
]);

render(html`
    <ul>
        ${each(tasks, (task) => task.id, (task) =>
        {
            const { text, done } = task.get();
            const state = computed(() => (done.get() ? "done" : ""));
            return html`<li class=${state}>${text}</li>`;
        })}
    </ul>`, "#app");

function finish(id: number, text: string): void
{
    const task = tasks.get().find((candidate) => candidate.id === id);
    batch(() =>
    {
        task?.text.set(text);
        task?.done.set(true);
    });
}

// Row 1 updates its text and class; the array stays as it is:
finish(1, "write, edited");
```

In js-framework-benchmark's own runner, updating every 10th row of 1,000 this way takes less than half the script time of setting a new array, 0.6 ms against 1.4, and creating the rows costs no more. The signals are made where the data arrives, as `{ id, text: signal(text) }`, and writes to several of them go in one `batch`, so the page updates once.

## Conditions

`when` shows one branch or another, depending on a condition that can be a signal:

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

A branch is built only when it first shows, and taken down when it hides, which stops the effects it started. A change that keeps the condition's truthiness, such as from one user name to another, keeps the branch as it is; the greeting above updates through its own `${user}` binding instead.

`when` reads its condition when it is a signal and takes any other value as it is.

> [!WARNING]
> A function is not a condition. `when(() => count.get() > 0, ...)` fails to compile in TypeScript and fails at run time with `when_condition_function`, since a function would always count as true. Derive the condition as a signal instead: `when(computed(() => count.get() > 0), ...)`.

## When part of a view fails

`boundary` keeps one part of a page from taking the rest down with it. It shows its content, and once the content throws, its fallback in the content's place, given the error and a `retry` that renders the content again.

```ts
import { boundary, computed, html, render, signal } from "zerolith";

const prices = signal<number[] | undefined>([12, 30, 8]);

function Highest()
{
    const highest = computed(() =>
    {
        const list = prices.get();
        if (list === undefined)
        {
            throw new Error("The prices did not load.");
        }
        return Math.max(...list);
    });
    return html`<p>Highest price: ${highest}</p>`;
}

function showProblem(error: unknown, retry: () => void)
{
    const text = error instanceof Error ? error.message : "Something failed.";
    return html`
        <p role="alert">${text}</p>
        <button type="button" @click=${retry}>Try again</button>`;
}

render(html`
    <h1>Prices</h1>
    ${boundary(() => Highest(), showProblem)}`, "#app");
```

- **What it catches.** A throw while the content renders, and later a throw from anything the content created, as it runs: a binding whose computed value throws, as `highest` does here, a branch `when` opens, a row `each` adds, or an effect. The error goes to the fallback in place of the code that changed the signal, and the rest of the page keeps running.
- **What it leaves alone.** An event handler that throws throws to the browser, as any listener does, and an error outside every boundary reaches the code that caused it. A fallback that throws goes to the boundary around it.
- **Every caught error is reported** as `boundary_caught`, so a fallback never hides one while you develop. On the server, a boundary whose content throws renders its fallback.

## Coming from React or Angular

Loops and conditions are functions called in a template rather than syntax, and the rest maps closely:

| To write | React | Angular | zerolith |
| --- | --- | --- | --- |
| A list | `items.map((item) => <li key={item.id}>...</li>)` | `@for (item of items; track item.id) { ... }` | `` each(items, (item) => item.id, (item) => html`<li>...</li>`) `` |
| A condition | `ok ? <A /> : <B />` | `@if (ok) { ... } @else { ... }` | `when(ok, () => A(), () => B())` |
| State | `useState(0)` | `signal(0)` | `signal(0)` |
| A derived value | `useMemo(() => ..., [deps])` | `computed(() => ...)` | `computed(() => ...)`, with no dependency list |
| A side effect | `useEffect(() => ..., [deps])` | `effect(() => ...)` | `effect(() => ...)`, with no dependency list |
| An event | `onClick={add}` | `(click)="add()"` | `@click=${add}` |
| A property | `value={name}` | `[value]="name"` | `.value=${name}` |
| A boolean attribute | `disabled={busy}` | `[disabled]="busy"` | `?disabled=${busy}` |

The difference that matters most is that a component runs once. React calls a component again on every change and Angular checks its template; zerolith does neither, so a plain `.map()` or `? :` in a template is evaluated once, which suits what never changes, such as a fixed row of buttons. Whatever should follow state goes through `each` and `when`, which update their part of the page as the signals they read change.

## The same component in JSX

With a build step, the same template can be spelled as JSX in a `.jsx` or `.tsx` file. It is another spelling, not another runtime: the Vite plugin and the command line rewrite each JSX expression into the `html` call it stands for before any other step, components stay the functions they are, and everything above holds unchanged, binding the signal included.

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
| `<div />`, `<path d="..." />` | `<div></div>`, `<path d="..."></path>`: closed, except a void element such as `<br />` or `<input />`, which becomes `<br>` |

Lists and conditions are `each` and `when`, called as functions, exactly as in a template; there is no `<For>` or `<Show>`. Spread attributes on an element are refused, because a template cannot express an unknown set of attributes; spread onto a component is plain object spread. A `tsconfig` with `"jsx": "react-jsx"` and `"jsxImportSource": "zerolith"` types the elements and the namespaces: `prop:` against the element's own property types, `on:` against the DOM's event map with `currentTarget` typed as the element, so `event.currentTarget.value` reads on an input and not on a div, `bool:` as a boolean, and `ref` as a function of the element or a writable signal, each of the first three taking a signal of the value as well. A plain attribute takes any value, written as text, and an element TypeScript does not know, such as a custom element, takes any property, handler, and flag.

> [!NOTE]
> JSX needs a build step, and the browser never sees it. A page that loads its modules as they are, from an import map, writes `html`.

## Raw markup

`unsafeHtml(markup)` inserts markup without escaping it. It exists for HTML you already trust, such as HTML your build rendered from Markdown you wrote.

> [!CAUTION]
> Never pass user input to `unsafeHtml`. Anything it receives runs as markup, scripts in event attributes included.

## The functions at a glance

| Function | Takes | Returns |
| --- | --- | --- |
| `` html`...` `` | A template literal with `${}` bindings | A view |
| `render(view, target)` | A view, or a function that returns one, called inside the root; and an element, a fragment, or a selector for one | A root, with `container` and `dispose()` |
| `hydrate(view, target)` | The same, over markup the server rendered | A root that also lists its `mismatches` |
| `each(items, key, row)` | An array or a signal of one; `key(item, index)`; and `row(item, index)`, which receives both as signals | A view of the rows, matched by key |
| `when(condition, then, otherwise)` | A signal or a value, and one or two functions that return views | A view of the branch the condition picks |
| `unsafeHtml(markup)` | A string of markup you trust | A view of that markup, unescaped |
| `boundary(content, fallback)` | A function that returns the content, and one that takes the error and `retry` and returns what to show in its place | A view of the content, or of the fallback once the content throws |
| `context(initial)` | The value to read where nothing is provided | A context, with `provide(value, fn)`, which returns what `fn` returns, and `read()` |

## What the renderer refuses

These fail with a coded error before anything reaches the page, each linked to its explanation and fix:

| What the template does | Error |
| --- | --- |
| Holds a `<script>` element | `script_in_template` |
| Puts an expression inside a comment | `binding_in_comment` |
| Puts an expression inside a `<template>` element, whose content the browser does not render | `binding_in_template_element` |
| Puts an expression where a tag name or an attribute name goes | `binding_in_tag_position` |
| Puts an expression inside `<style>`, `<textarea>`, or another raw-text element | `binding_in_raw_text` |
| Binds the `.innerHTML`, `.outerHTML`, or `.srcdoc` property | `unsafe_property_binding` |
| Binds the `srcdoc` attribute or any attribute that starts with `on` | `unsafe_attribute_binding` |
| Renders a function or a plain object as content, usually a component passed instead of called | `unrenderable_value` |
| Gives `@event` something other than a function or a `handleEvent` object | `event_handler_not_function` |
| Gives `when` a function as its condition, which would always count as true | `when_condition_function` |
| Gives `each` a function as its items, which it would read as no rows | `each_items_function` |
| Gives `render` or `hydrate` a component that takes props, uncalled | `mount_component_uncalled` |

One more is reported without failing the render: a `javascript:` or `vbscript:` URL, or a `data:` URL other than a PNG, GIF, JPEG, WebP, AVIF, BMP, or icon image (an SVG can carry script), in `href`, `src`, `xlink:href`, `action`, `formaction`, or `poster`, bound as an attribute or as a property such as `.href`, is removed and reported as `unsafe_url_blocked`.
