# @zerolith/vite/runtime

Every export of `@zerolith/vite/runtime` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function accept(): void
function component<T extends AnyFunction>(hot: HotContext | undefined, name: string, impl: T): T
function hydrate(factory: () => unknown, target: core.MountTarget): core.HydrateResult
function render(factory: () => unknown, target: core.MountTarget): core.Root
function save(): void

interface HotContext
{
    readonly data: Record<string, unknown>
}
```
