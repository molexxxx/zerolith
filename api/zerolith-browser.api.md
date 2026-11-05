# @zerolith/browser

Every export of `@zerolith/browser` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function inView(target: Element | ReadableSignal<Element | undefined>, options?: InViewOptions): ReadableSignal<boolean>
function online(): ReadableSignal<boolean>
function size(target: Element | ReadableSignal<Element | undefined>): ReadableSignal<Size>
function visible(): ReadableSignal<boolean>
function windowSize(): ReadableSignal<Size>

interface InViewOptions
{
    rootMargin?: string
    threshold?: number
}

interface Size
{
    readonly width: number
    readonly height: number
}
```
