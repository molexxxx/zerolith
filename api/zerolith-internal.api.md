# zerolith/internal

Every export of `zerolith/internal` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function devtoolsInternal<T>(fn: () => T): T
function devtoolsSaveRestore(state: Record<string, unknown>): void
function prepared(strings: readonly string[], markup: string, parts: readonly PreparedPart[]): TemplateStringsArray
function scan(strings: readonly string[]): Scanned

interface DevtoolsHook
{
    readonly version: number
    nodes(): NodeSnapshot[]
    roots(): RootSnapshot[]
    diagnostics(): Diagnostic[]
    subscribe(listener: (event: DevtoolsEvent) => void): () => void
}

interface NodeSnapshot
{
    id: number
    kind: "state" | "computed" | "effect"
    name: string | undefined
    value?: unknown
    observers: number
    internal: boolean
}

interface PartSpec
{
    kind: number
    index: number
    name: string
    strings: readonly string[]
    count: number
}

interface RootSnapshot
{
    id: number
    kind: "render" | "hydrate"
    container: Node
    internal: boolean
}

interface Scanned
{
    markup: string
    parts: PartSpec[]
}

type DevtoolsEvent = { type: "node"; id: number } | { type: "root"; id: number; removed: boolean } | { type: "diagnostic"; diagnostic: Diagnostic } | { type: "flush"; effects: number }
type PreparedPart = readonly [number, string, readonly string[]]

const SCOPE_MARKER: string
const version: string
```
