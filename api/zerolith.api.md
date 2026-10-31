# zerolith

Every export of `zerolith` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function batch<T>(fn: () => T): T
function computed<T>(fn: () => T, options?: SignalOptions<T>): ReadableSignal<T>
function css(strings: TemplateStringsArray, ...values: ReadonlyArray<number | Styles>): Styles
function each<T>(items: ReadableSignal<readonly T[]> | readonly T[], key: KeyOf<T>, row: RowOf<T>): View
function effect(fn: EffectFunction): () => void
function html(strings: TemplateStringsArray, ...values: unknown[]): View
function hydrate(view: unknown, target: MountTarget): HydrateResult
function isProblem(value: unknown): value is Problem
function onDiagnostic(listener: DiagnosticListener): () => void
function onDispose(fn: () => void): void
function render(view: unknown, target: MountTarget): Root
function resource<P, T>(options: ResourceOptions<P, T>): Resource<T>
function scope<T>(fn: () => T): Scope<T>
function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T>
function unsafeHtml(markup: string): View
function untracked<T>(fn: () => T): T
function when(condition: unknown, then: () => unknown, otherwise?: () => unknown): View

class ZerolithError extends Error
{
    constructor(record: Diagnostic)
    readonly diagnostic: Diagnostic
}

interface Diagnostic
{
    code: string
    severity: DiagnosticSeverity
    cause: string
    fix: string
    url: string
    location?: DiagnosticLocation
    suggestion?: DiagnosticSuggestion
    args?: DiagnosticArgs
}

interface DiagnosticLocation
{
    file?: string
    line?: number
    column?: number
    selector?: string
}

interface DiagnosticSuggestion
{
    description: string
    replacement?: string
    applicability: Applicability
}

interface DiagnosticText
{
    cause: string
    fix: string
}

interface HydrateResult extends Root
{
    readonly mismatches: readonly HydrationMismatch[]
}

interface HydrationMismatch
{
    kind: "text" | "missing" | "extra" | "structure" | "root"
    expected?: string
    found?: string
}

interface LoaderContext<P>
{
    params: P
    abort: AbortSignal
}

interface Problem
{
    type?: string
    title?: string
    status?: number
    detail?: string
    instance?: string
    fields?: FieldErrors
}

interface ReadableSignal<T>
{
    get(): T
}

interface Resource<T> extends ReadableSignal<T | undefined>
{
    readonly status: ReadableSignal<ResourceStatus>
    readonly pending: ReadableSignal<boolean>
    readonly error: ReadableSignal<unknown>
    get(): T | undefined
    reload(): void
}

interface ResourceOptions<P, T>
{
    params: () => P | undefined
    loader: (context: LoaderContext<P>) => Promise<T>
}

interface Root
{
    readonly container: Element | DocumentFragment
    dispose(): void
}

interface Scope<T>
{
    readonly value: T
    dispose(): void
}

interface Signal<T> extends ReadableSignal<T>
{
    set(value: T): void
}

interface SignalOptions<T>
{
    equals?: Equals<T>
    name?: string
}

interface Styles
{
    readonly scope: string
    readonly text: string
    toString(): string
}

interface View
{
    readonly VIEW: true
}

type Applicability = "machine_applicable" | "maybe_incorrect" | "has_placeholders" | "unspecified"
type DiagnosticArgs = Readonly<Record<string, string | number | boolean>>
type DiagnosticCode = "signal_written_inside_computed" | "computed_cycle" | "effect_cycle" | "effect_loop" | "on_dispose_outside_scope" | "binding_in_tag_position" | "binding_in_comment" | "binding_in_raw_text" | "binding_not_single" | "script_in_template" | "template_unclosed_tag" | "unsafe_property_binding" | "unsafe_attribute_binding" | "unsafe_url_blocked" | "unrenderable_value" | "event_handler_not_function" | "each_key_undefined" | "each_key_duplicate" | "css_value_not_allowed" | "ref_not_assignable" | "hydration_mismatch" | "jsx_not_lowered" | "template_frozen_read" | "image_without_alt" | "button_without_name" | "frame_without_title" | "mount_target_missing" | "template_not_prepared" | "lazy_module_not_split" | "package_version_mismatch"
type DiagnosticListener = (diagnostic: Diagnostic) => void
type DiagnosticSeverity = "error" | "warning" | "deprecation" | "info"
type EffectFunction = () => void | (() => void)
type Equals<T> = (previous: T, next: T) => boolean
type FieldErrors = Readonly<Record<string, readonly string[]>>
type KeyOf<T> = (item: T, index: number) => string | number | bigint | boolean | symbol | object
type MountTarget = Element | DocumentFragment | string
type ResourceStatus = "idle" | "pending" | "resolved" | "error"
type RowOf<T> = (item: ReadableSignal<T>, index: ReadableSignal<number>) => unknown

const DIAGNOSTIC_URL: string
const diagnosticCatalog: Readonly<Partial<Record<DiagnosticCode, DiagnosticText>>>
const PROBLEM_MEDIA_TYPE: string
```
