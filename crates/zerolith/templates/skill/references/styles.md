<!-- Generated from docs/guide/styles.md by npm run skills. Edit the guide, then regenerate. -->

# Styles

A component keeps its styles next to its markup in a `css` literal. The rules apply to that component's elements and stop at the components it contains, without a shadow DOM, so global styles, design tokens, and resets keep working everywhere.

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

## Global styles

Design tokens, resets, fonts, and element defaults belong in a global stylesheet, which a project from `zerolith new` keeps in `src/styles.css`, linked from `index.html`. Component styles build on it: a rule in a `css` literal can read any custom property the global stylesheet defines.

## Server rendering

On the server, `renderStyles()` from `zerolith/ssr` returns the markup of one `<style>` element for each stylesheet created so far, in creation order, for the document head, so a server-rendered page is styled before any script runs. Since `css` runs when its module loads, importing the components is enough for their styles to be included. The [server rendering guide](server-rendering.md) shows it in a full page.

## Browser support

`@scope` is supported in Chrome 118, Safari 17.4, and Firefox 146, and constructable stylesheets since Safari 16.4.
