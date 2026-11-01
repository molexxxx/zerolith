<!-- Generated from docs/guide/styles.md by npm run skills. Edit the guide, then regenerate. -->

# Styles

A component keeps its styles next to its markup, in a `css` literal or in a stylesheet beside it. The rules apply to that component's elements and stop at the components it contains, without a shadow DOM, so global styles, design tokens, and resets keep working everywhere.

```ts
import { css, html, render } from "zerolith";

const card = css`
    :scope { padding: 12px; }
    h2 { margin: 0; }
`;

function Card({ title }: { title: string })
{
    return html`<article class=${card}><h2>${title}</h2></article>`;
}

render(Card({ title: "Scoped" }), "#app");
```

Binding the result to `class` marks the element as the root of the component's styles. The `css` call creates the stylesheet and the document adopts it right away, so a literal at the top of a module is in place before anything renders. The same text always produces the same class, and two literals with the same text share one stylesheet.

> [!TIP]
> Keep `css` at the top level of a module, beside the component that uses it. Inside a component function it would run again on every call; the cache returns the same stylesheet, but a module-level constant skips the work.

## How the scope works

A scope starts at the element that binds the class and ends at the edge of any styled component inside it. Here a panel contains a note, and each has its own styles:

```ts
import { css, html, render } from "zerolith";

const note = css`
    p { margin: 0; }
`;
const panel = css`
    :scope { display: grid; gap: 8px; }
    aside { border: 2px solid gray; }
    p { font-weight: 700; }
`;

function Note({ text }: { text: string })
{
    return html`<aside class=${note}><p>${text}</p></aside>`;
}

function Panel()
{
    return html`
        <section class=${panel}>
            <p>The panel's own paragraph is bold.</p>
            ${Note({ text: "The note's paragraph is not." })}
        </section>`;
}

render(Panel(), "#app");
```

- `:scope` selects the root itself, here the `section`.
- A parent's rules reach a nested component's root, so the panel gives the note's `aside` its border, as a parent lays out its children.
- They stop there: the panel's `p` rule never reaches the paragraph inside the note, and the note's own rules stay inside the note.

Behind this is one constructable stylesheet per literal, adopted by the document. The class a root binds holds two names: `zl-s`, a marker every styled root carries, and `zl-` followed by a hash of the rules, which keys the stylesheet. The panel's literal reaches the browser as this stylesheet, where `zl-…` stands for its hash:

```css
@scope (.zl-…) to (:scope .zl-s > *) {
    :scope { display: grid; gap: 8px; }
    aside { border: 2px solid gray; }
    p { font-weight: 700; }
}
```

The `to` clause is the lower edge: the rules stop at the children of any `zl-s` root inside the panel, so a nested component's root is the last element they reach.

> [!NOTE]
> There is no shadow DOM and no rewriting of selectors. The browser applies the `@scope` rule, global styles reach every component, and the elements in DevTools are the elements you wrote.

## Composing styles

A `css` literal interpolated into another adds its rules to the new one, so shared rules are written once and composed where they apply:

```ts
import { css, html, render } from "zerolith";

const control = css`
    :scope { padding: 8px 12px; border: 2px solid currentColor; }
`;
const primary = css`
    ${control}
    :scope { font-weight: 700; }
`;

render(html`<button class=${primary}>Save</button>`, "#app");
```

Two kinds of value can be interpolated, and nothing else:

| Value | Becomes |
| --- | --- |
| A `css` result | Its rules, added where it appears |
| A number | Its digits, as in `` css`:scope { gap: ${8}px; }` `` |
| A string, or anything else | An error, `css_value_not_allowed` |

> [!WARNING]
> The refusal of strings is deliberate: text that came from data or a user can never become a selector or a rule. A value that depends on data belongs in a custom property, as the next section shows.

## Values that change

Rules are fixed when the module loads, so a value that changes at run time goes in a custom property set through a `style` binding, and the rules read it with `var()`:

```ts
import { computed, css, html, render, signal } from "zerolith";

const meter = css`
    :scope { height: 8px; background: gray; }
    div { width: var(--level); height: 100%; background: green; }
`;
const level = signal(30);

render(html`
    <div class=${meter}>
        <div style=${computed(() => `--level: ${level.get()}%`)}></div>
    </div>`, "#app");

level.set(60);                          // the bar fills 60 percent
```

The binding updates one attribute when `level` changes, and the browser does the rest; the stylesheet itself never changes.

## Styles in their own file

A component's styles can also live in a stylesheet of their own, a `.css` file beside the component imported with `?scoped`. This one styles an order summary:

```css
:scope
{
    display: grid;
    gap: 8px;
    padding: 16px;
    border: 2px solid currentColor;
}

h2
{
    margin: 0;
    font-size: 1.25rem;
}

.total
{
    font-weight: 700;

    & small
    {
        font-weight: 400;
    }
}
```

The import gives the same value a `css` literal returns, bound to a root element the same way, and the rules are scoped the same way:

```ts
import { html, render } from "zerolith";
import summary from "./summary.css?scoped";

function Summary({ total }: { total: string })
{
    return html`
        <section class=${summary}>
            <h2>Order</h2>
            <p class="total">${total} <small>with tax</small></p>
        </section>
    `;
}

render(Summary({ total: "$42.00" }), "#app");
```

The file is plain CSS, so an editor checks and completes it, and nesting and media queries read as they do in any stylesheet. `zerolith dev`, `zerolith build`, its `--unbundled` output, Vite with `@zerolith/vite`, and Vitest with the same plugin all handle the import, and the production build processes the file as it processes the project's other CSS: imports inlined, references rewritten, lowered for older browsers, and minified. The two spellings differ in a few ways:

| | A `css` literal | A file imported with `?scoped` |
| --- | --- | --- |
| Where the rules live | In the module, beside the markup | In a stylesheet beside the module |
| Values in the rules | Numbers and other `css` results | None; a value that changes goes in a custom property |
| `@import` | Not available | A local stylesheet is inlined and scoped with the rest; a remote one is refused |
| `url()` | Resolves against the page | Resolves against the stylesheet, as in any CSS file |
| The scope class | `zl-` and a hash of the rules | `zl-`, the file's name, and a hash of its path, so it stays put while the file changes |
| An edit in development | Runs the module again | Replaces the rules in place, with no reload |

> [!NOTE]
> A remote `@import`, such as a web font's stylesheet, is refused because the document adopts the rules as a constructable stylesheet, which cannot load one. Link it from `index.html` or import it from the global stylesheet.

A file's styles compose like a literal's, so `` css`${summary} .note { margin: 0; }` `` adds its rules to a new literal. TypeScript learns the import's type from `zerolith/imports`, which also declares a plain stylesheet import such as `import "./print.css"`, since TypeScript 7 rejects an import that names no module it knows. The `src/env.d.ts` of a project from `zerolith new` references it; an older project adds the line itself:

```ts
/// <reference types="zerolith/imports" />
```

## Global styles

Design tokens, resets, fonts, and element defaults belong in a global stylesheet, which a project from `zerolith new` keeps in `src/styles.css`, linked from `index.html`. Component styles build on it: a rule in a `css` literal or a scoped file can read any custom property the global stylesheet defines. A module can import a global stylesheet too, as `import "./print.css"` without `?scoped`, and its rules then apply to the whole page.

## Server rendering

On the server, `renderStyles()` from `zerolith/ssr` returns the markup of one `<style>` element for each stylesheet created so far, literals and scoped files alike, in creation order, for the document head, so a server-rendered page is styled before any script runs. Since the styles are created when their modules load, importing the components is enough for their styles to be included, and a scoped file's class comes from its path, so the server and the browser agree on it even when their builds process the file differently. The [server rendering guide](server-rendering.md) shows it in a full page.

## Browser support

`@scope` is supported in Chrome 118, Safari 17.4, and Firefox 146, and constructable stylesheets since Safari 16.4.
