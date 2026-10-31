# @zerolith/router

Every export of `@zerolith/router` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function createRouter<T extends RouteTable>(routes: T, options?: RouterOptions): Router<T>
function defineRoutes<T extends RouteTable>(routes: T): T
function lazy<Params, Data>(loader: () => Promise<RouteView<Params, Data>>): LazyView<Params, Data>
function route<Path extends string, Data = undefined>(definition: RouteDefinition<Path, Data>): RouteDefinition<Path, Data>

interface AnyRoute
{
    readonly path: string
    readonly view: unknown
    readonly load?: unknown
    readonly head?: unknown
}

interface EmbeddedRouteState
{
    readonly name: string
    readonly href: string
    readonly data: unknown
}

interface Head
{
    title?: string
    description?: string
}

interface LazyView<Params, Data>
{
    readonly lazy: () => Promise<RouteView<Params, Data>>
}

interface LoadContext<Params>
{
    params: Params
    url: URL
    abort: AbortSignal
}

interface Match
{
    readonly name: string
    readonly params: Readonly<Record<string, string>>
    readonly url: URL
    readonly data: unknown
}

interface NavigationEvent
{
    readonly type: "start" | "commit" | "error"
    readonly id: number
    readonly url: URL
    readonly mode: "push" | "replace" | "pop"
    readonly name?: string | undefined
    readonly error?: unknown
}

interface RouteContext<Params, Data>
{
    params: Params
    data: Data
    url: URL
}

interface RouteDefinition<Path extends string = string, Data = undefined>
{
    path: Path
    view: RouteView<ParamsOf<Path>, Data> | LazyView<ParamsOf<Path>, Data>
    load?: (context: LoadContext<ParamsOf<Path>>) => Promise<Data>
    head?: Head | ((context: RouteContext<ParamsOf<Path>, Data>) => Head)
}

interface Router<T extends RouteTable>
{
    readonly current: ReadableSignal<Match | undefined>
    readonly url: ReadableSignal<URL>
    readonly pending: ReadableSignal<boolean>
    readonly head: ReadableSignal<Head>
    readonly ready: Promise<void>
    href<N extends keyof T & string>(name: N, ...args: HrefArgs<T[N]["path"]>): string
    navigate(to: string, options?: { replace?: boolean }): Promise<void>
    matches(path: string, options?: { exact?: boolean }): ReadableSignal<boolean>
    outlet(): View
    dispose(): void
}

interface RouterOptions
{
    fallback?: (url: URL) => unknown
    onError?: (error: unknown, url: URL) => void
    scroll?: boolean
    window?: Window | null
    observe?: (event: NavigationEvent) => void
    base?: string
}

type HrefArgs<Path extends string> = Record<string, never> extends ParamsOf<Path> ? [] : [ParamsOf<Path>]
type ParamsOf<Path extends string> = Path extends `${infer Head}/${infer Rest}` ? ParamsOf<Head> & ParamsOf<Rest> : Path extends `:${infer Name}` ? { [K in Name]: string } : Path extends `*${infer Name}` ? { [K in Name]: string } : {}
type RouteTable = Readonly<Record<string, AnyRoute>>
type RouteView<Params, Data> = (context: RouteContext<Params, Data>) => unknown

const ROUTE_STATE_SELECTOR: string
```
