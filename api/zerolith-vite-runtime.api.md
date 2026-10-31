# @zerolith/vite/runtime

function accept(): void
function component<T extends AnyFunction>(hot: HotContext | undefined, name: string, impl: T): T
function hydrate(factory: () => unknown, target: core.MountTarget): core.HydrateResult
function render(factory: () => unknown, target: core.MountTarget): core.Root
function save(): void
interface HotContext
    readonly data: Record<string, unknown>
