# @zerolith/devtools

Every export of `@zerolith/devtools` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function describeValue(value: unknown): string
function mountDevtools(options?: DevtoolsOptions): DevtoolsHandle

interface DevtoolsHandle
{
    toggle(open?: boolean): void
    dispose(): void
}

interface DevtoolsOptions
{
    open?: boolean
}
```
