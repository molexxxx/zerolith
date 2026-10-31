# @zerolith/a11y

function createAnnouncer(_): Announcer
function focusables(root: Element): HTMLElement[]
function focusOrigin(_): FocusOriginMonitor
function focusTrap(_): (element: Element) => void
function forcedColors(): ReadableSignal<boolean>
function mediaQuery(query: string): ReadableSignal<boolean>
function reducedMotion(): ReadableSignal<boolean>
function rovingTabindex(_): (element: Element) => void
interface Announcer
    announce(message: string, politeness?: Politeness): void
    dispose(): void
interface FocusOriginMonitor
    readonly origin: ReadableSignal<FocusOrigin | null>
    dispose(): void
interface FocusTrapOptions
    initial?: string | HTMLElement | false
    restore?: boolean
interface RovingOptions
    items?: string
    orientation?: "horizontal" | "vertical" | "both"
    loop?: boolean
type FocusOrigin = "keyboard" | "pointer" | "touch" | "program"
type Politeness = "polite" | "assertive"
const visuallyHidden: Styles
