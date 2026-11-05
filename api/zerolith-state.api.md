# @zerolith/state

Every export of `@zerolith/state` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function debounced<T>(source: ReadableSignal<T>, ms: number): ReadableSignal<T>
function history<T>(source: Signal<T>, options?: HistoryOptions): History<T>
function selector<T>(source: ReadableSignal<T>): (key: T) => ReadableSignal<boolean>
function stored<T>(key: string, initial: T, options?: StoredOptions<T>): Signal<T>
function throttled<T>(source: ReadableSignal<T>, ms: number): ReadableSignal<T>

interface History<T>
{
    readonly canUndo: ReadableSignal<boolean>
    readonly canRedo: ReadableSignal<boolean>
    readonly source: Signal<T>
    checkpoint(): void
    undo(): boolean
    redo(): boolean
    dispose(): void
}

interface HistoryOptions
{
    limit?: number
}

interface StoredOptions<T>
{
    storage?: "local" | "session"
    equals?: (previous: T, next: T) => boolean
}
```
