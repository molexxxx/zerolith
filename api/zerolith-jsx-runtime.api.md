# zerolith/jsx-runtime

Every export of `zerolith/jsx-runtime` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function jsx(): never
function jsxDEV(): never
function jsxs(): never

type ElementAttributes = { readonly children?: unknown; readonly ref?: unknown; readonly [attribute: string]: unknown; readonly [property: `prop:${string}`]: unknown; readonly [event: `on:${string}`]: unknown; readonly [flag: `bool:${string}`]: unknown }

const Fragment: unique symbol

namespace JSX
{
    type Element = View
    interface ElementChildrenAttribute { children: unknown }
    interface IntrinsicAttributes { ref?: unknown }
    type IntrinsicElements = { readonly [tag in keyof HTMLElementTagNameMap]: ElementAttributes } & { readonly [tag: string]: ElementAttributes }
}
```
