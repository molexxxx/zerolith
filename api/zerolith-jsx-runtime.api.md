# zerolith/jsx-runtime

Every export of `zerolith/jsx-runtime` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function jsx(): never
function jsxDEV(): never
function jsxs(): never

type AnyElementAttributes = { readonly children?: unknown; readonly ref?: unknown; readonly [attribute: string]: unknown }
type Bindable<T> = T | ReadableSignal<T>
type BooleanAttributes = { readonly [flag: `bool:${string}`]: Bindable<boolean | null | undefined> }
type ElementAttributes<E = HTMLElement> = { readonly children?: unknown; readonly ref?: Ref<E>; readonly [attribute: string]: unknown } & PropertyAttributes<E> & EventAttributes<E> & BooleanAttributes
type EventAttributes<E> = { readonly [K in keyof HTMLElementEventMap as `on:${K}`]?: EventHandler<HTMLElementEventMap[K], E> }
type EventHandler<Ev extends Event, E> = ((event: Ev & { readonly currentTarget: E }) => void) | { capture?: boolean; passive?: boolean; once?: boolean; handleEvent(event: Ev & { readonly currentTarget: E }): void } | null | undefined
type KnownElements = { readonly [tag in keyof HTMLElementTagNameMap]: ElementAttributes<HTMLElementTagNameMap[tag]> }
type PropertyAttributes<E> = { readonly [K in Extract<keyof E, string> as `prop:${K}`]?: Bindable<E[K]> }
type Ref<E> = ((element: E) => void) | { set(value: E | undefined): void; get(): Element | undefined }

const Fragment: unique symbol

namespace JSX
{
    type Element = View
    interface ElementChildrenAttribute { children: unknown }
    interface IntrinsicAttributes { ref?: unknown }
    interface IntrinsicElements extends KnownElements { readonly [tag: string]: AnyElementAttributes }
}
```
