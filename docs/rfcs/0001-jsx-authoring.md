# 0001: JSX as sugar for `html`

Date: 2026-10-29. Status: accepted on 2026-10-29 by the project lead, who delegated the call with the direction that decisions follow the research plan; shipped on main the same day with the Vite lowering, and the Rust lowering in `zerolith dev` the day after, both over the same text edits.

## Problem

Components are plain functions returning `html` tagged templates, and children are composed by calling them inside a template: `${Counter({ start: 1 })}`. That is the form that runs with no build step, under a strict CSP, and under Trusted Types, and it is why a child's props are checked by `tsc` with no language service plugin. It is also unfamiliar to the largest group of frontend developers, who write components as tags, `<Counter start={1} />`, and to the models trained on their code. The research report planned for this: "JSX sugar lower to the same tagged-template calls the runtime already accepts, exactly as Lit's labs compiler and Preact's jsx-to-htm do today", and it ruled out JSX as the buildless form because Node and TC39 exclude it.

The problem is therefore to offer the tag syntax where a build step exists, without a second runtime path, a second rendering model, or a divergence between what a `.tsx` file and a `.ts` file can do.

## Proposal

JSX is a compile-time spelling of `html`. The Vite plugin, and later the Rust command line through oxc, lowers each JSX expression in a `.jsx` or `.tsx` file to the `html` call it stands for, with components called as functions. Nothing new runs in the browser; `zerolith/jsx-runtime` exists only so that `tsconfig` and editors accept `jsxImportSource: "zerolith"`, and it exports the types that make JSX elements and the `html` return type one and the same.

What a user writes:

```tsx
import { signal } from "zerolith";
import { Counter } from "./counter.tsx";

export function App()
{
    const name = signal("Ada");
    return (
        <main class="app">
            <h1>Hello {name}</h1>
            <input prop:value={name} on:input={(event) => name.set(event.currentTarget.value)} />
            <button bool:disabled={pending}>Save</button>
            <Counter start={1}>
                <b>children are a prop</b>
            </Counter>
        </main>
    );
}
```

What the plugin emits, and what the browser runs:

```ts
return html`<main class="app">
    <h1>Hello ${name}</h1>
    <input .value=${name} @input=${(event) => name.set(event.currentTarget.value)}>
    <button ?disabled=${pending}>Save</button>
    ${Counter({ start: 1, children: html`<b>children are a prop</b>` })}
</main>`;
```

The rules:

- Lowercase tags are elements and become template markup. An attribute with a static string stays markup; an attribute with an expression becomes an `attr=${}` binding.
- Namespaced attributes select the other binding forms, the way Solid spells them: `prop:value` is `.value=${}`, `on:input` is `@input=${}`, `bool:disabled` is `?disabled=${}`, and `ref` is `ref=${}`. `class` and `for` are the attribute names, not `className` and `htmlFor`; there is no camelCase remapping and no `style` object, because the template has neither.
- Capitalized tags and member expressions are components and become `${Tag({ ...props, children })}`. Children are the `children` prop: one child is passed as is, several as an array. A component is therefore the same function it is in a `.ts` file, with props checked by `tsc` through the `jsxImportSource` types.
- `{expression}` in content is a child part, exactly `${expression}`. Signals bind live, values render once, and the rule that `{count.get()}` freezes holds as it does in templates.
- Fragments `<>...</>` are a template with no root element. Conditionals and lists are `when` and `each`, called as functions, as in templates; the RFC adds no `<Show>` or `<For>` elements, so that the two spellings have one vocabulary.
- Spread props on elements are not supported, because a template cannot express an unknown set of attributes; spread on components is plain object spread.
- A static JSX subtree becomes static markup, so the ahead-of-time prepare pass in ADR 0005 applies to it unchanged.

What the proposal adds to the public surface:

- `zerolith/jsx-runtime` and `zerolith/jsx-dev-runtime`: type-only modules declaring `JSX.Element` as `View`, `JSX.IntrinsicElements` from the DOM's element map with the `prop:`, `on:`, `bool:` namespaces typed, and `JSX.ElementChildrenAttribute` as `children`. Their `jsx`, `jsxs`, and `jsxDEV` exports throw with a diagnostic, because reaching them means the lowering did not run.
- `@zerolith/vite`: the lowering, on by default for `.jsx` and `.tsx` ids, with `jsx: false` to turn it off.
- `zerolith dev` and `zerolith build` in the Rust command line: the same lowering through `oxc_transformer`, so a buildless project can keep `.tsx` sources while the server strips types and lowers JSX on the fly, as it already strips types with Vite.

JavaScript and TypeScript stay equal: `.jsx` lowers like `.tsx`, and a project that does not want JSX never touches it. JSX is not parsed in `.js` or `.ts` files, matching every other tool.

## Alternatives considered

- A JSX runtime that builds DOM directly (`jsx(type, props)` creating elements and effects), the Solid and Preact model. It would be a second rendering path with its own hydration, its own server renderer, and its own bugs, and it would push the production bundle past the budget. Rejected for the reason the report gave: the build is an optimizer, not a requirement, so the built form must mean the same thing as the unbuilt one.
- Dynamic tags inside templates, `<${Counter} start=${1} />`, the htm spelling. It needs no build step, but it changes the scanner, costs bytes in every bundle, and is as unfamiliar as the function call it replaces. Not taken.
- Leaving composition as function calls only. It is the buildless truth and stays the documented form; the RFC adds the familiar spelling on top, it does not replace anything.

## Migration

None. Existing `.ts` and `.js` code is unchanged. A `.tsx` file that uses the lowering can be rewritten to `html` by running the lowering once and keeping its output, which the plugin can do with a `--emit` flag in a later release.

## Effect on size and on the agent index

Zero bytes in the production bundle: the lowering runs at build time and the runtime modules are type-only, with throwing stubs that tree-shake away. The agent index gains the three namespaces and the children rule; the guide on templates gains a section showing the same component in both spellings.

## Open questions

- Whether `on:` should also accept the React spelling `onClick` as an alias. The current answer is no, one spelling per binding, but the cost of accepting both is one line in the lowering.
- Whether the editor tooling (the zquery-vs-code successor) should show the lowered template on hover, so that the two spellings teach each other.
- Whether `children` of an element (not a component) with a single text child should stay static markup when the child is a template literal with no expressions.
