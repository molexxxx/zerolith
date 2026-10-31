# @zerolith/test

function accessibilityIssues(container: ParentNode): AccessibilityIssue[]
function cleanup(): void
function hydrationMismatches(view: () => unknown): HydrationMismatch[]
function mount(view: unknown, _): Mounted
function settle(_): Promise<void>
interface AccessibilityIssue
    readonly code: AccessibilityCode
    readonly element: Element
interface Mounted
    readonly container: HTMLElement
    readonly root: Root
    unmount(): void
interface MountOptions
    container?: HTMLElement
    attach?: boolean
type AccessibilityCode = "image_without_alt" | "control_without_label" | "button_without_name" | "link_without_name" | "frame_without_title"
