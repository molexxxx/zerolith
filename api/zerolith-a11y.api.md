# @zerolith/a11y

Every export of `@zerolith/a11y` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function createAnnouncer(doc?: Document): Announcer
function focusables(root: Element): HTMLElement[]
function focusOrigin(doc?: Document): FocusOriginMonitor
function focusTrap(options?: FocusTrapOptions): (element: Element) => void
function forcedColors(): ReadableSignal<boolean>
function mediaQuery(query: string): ReadableSignal<boolean>
function reducedMotion(): ReadableSignal<boolean>
function rovingTabindex(options?: RovingOptions): (element: Element) => void

interface Announcer
{
    announce(message: string, politeness?: Politeness): void
    dispose(): void
}

interface FocusOriginMonitor
{
    readonly origin: ReadableSignal<FocusOrigin | null>
    dispose(): void
}

interface FocusTrapOptions
{
    initial?: string | HTMLElement | false
    restore?: boolean
}

interface RovingOptions
{
    items?: string
    orientation?: "horizontal" | "vertical" | "both"
    loop?: boolean
}

type FocusOrigin = "keyboard" | "pointer" | "touch" | "program"
type Politeness = "polite" | "assertive"

const visuallyHidden: Styles
```
