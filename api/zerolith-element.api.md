# zerolith/element

Every export of `zerolith/element` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function define<Props extends readonly string[]>(name: string, options: ElementOptions<Props>): void

interface ElementOptions<Props extends readonly string[]>
{
    props: Props
    view: (props: ElementProps<Props>, host: HTMLElement) => unknown
}

type ElementProps<Props extends readonly string[]> = { readonly [K in Props[number]]: ReadableSignal<unknown> }
```
