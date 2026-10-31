# @zerolith/test

Every export of `@zerolith/test` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function accessibilityIssues(container: ParentNode): AccessibilityIssue[]
function cleanup(): void
function hydrationMismatches(view: () => unknown): HydrationMismatch[]
function mount(view: unknown, options?: MountOptions): Mounted
function settle(rounds?: number): Promise<void>

interface AccessibilityIssue
{
    readonly code: AccessibilityCode
    readonly element: Element
}

interface Mounted
{
    readonly container: HTMLElement
    readonly root: Root
    unmount(): void
}

interface MountOptions
{
    container?: HTMLElement
    attach?: boolean
}

type AccessibilityCode = "image_without_alt" | "control_without_label" | "button_without_name" | "link_without_name" | "frame_without_title"
```
