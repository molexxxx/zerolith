# @zerolith/state

Every export of `@zerolith/state` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function debounced<T>(source: ReadableSignal<T>, ms: number): ReadableSignal<T>
function history<T>(source: Signal<T>, options?: HistoryOptions): History<T>
function reconcile<T>(data: T, key?: string): Reconciled<T>
function selector<T>(source: ReadableSignal<T>): (key: T) => ReadableSignal<boolean>
function snapshot<S>(value: S): Snapshot<S>
function store<T extends object>(initial: T): [Store<T>, SetStore<T>]
function stored<T>(key: string, initial: T, options?: StoredOptions<T>): Signal<T>
function throttled<T>(source: ReadableSignal<T>, ms: number): ReadableSignal<T>

class Reconciled<T>
{
    constructor(data: T, key: string | undefined)
    readonly data: T
    readonly key: string | undefined
}

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
    validate?: (value: unknown) => boolean
}

type Next<V> = V | ((previous: V) => V) | Reconciled<V>
type SetStore<T> = { <A extends Key<T>>(a: A, next: Next<At<T, A>>): void; <A extends Key<T>, B extends Key<At<T, A>>>(a: A, b: B, next: Next<At<At<T, A>, B>>): void; <A extends Key<T>, B extends Key<At<T, A>>, C extends Key<At<At<T, A>, B>>>(a: A, b: B, c: C, next: Next<At<At<At<T, A>, B>, C>>): void; <A extends Key<T>, B extends Key<At<T, A>>, C extends Key<At<At<T, A>, B>>, D extends Key<At<At<At<T, A>, B>, C>>>(a: A, b: B, c: C, d: D, next: Next<At<At<At<At<T, A>, B>, C>, D>>): void }
type Snapshot<S> = S extends (...args: never[]) => unknown ? S : S extends ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | Date | RegExp | Promise<unknown> ? S : S extends object ? { -readonly [K in keyof S]: Snapshot<S[K]> } : S
type Store<T> = T extends (...args: never[]) => unknown ? T : T extends ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | Date | RegExp | Promise<unknown> ? T : T extends object ? { readonly [K in keyof T]: Store<T[K]> } : T
```
