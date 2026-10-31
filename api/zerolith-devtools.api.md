# @zerolith/devtools

function describeValue(value: unknown): string
function mountDevtools(_): DevtoolsHandle
interface DevtoolsHandle
    toggle(open?: boolean): void
    dispose(): void
interface DevtoolsOptions
    open?: boolean
