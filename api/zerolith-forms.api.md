# @zerolith/forms

Every export of `@zerolith/forms` with its signature, generated from the source by `npm run api`. The docs build fails while the exports differ from this file, so a change to the public API shows up here in review.

```ts
function createForm(options?: FormOptions): Form
function formValues(data: FormData): FormValues
function problemFromIssues(issues: ReadonlyArray<StandardIssue>): Problem
function problemResponse(problem: Problem, init?: ResponseInit): Response
async function validateForm<S extends StandardSchema>(schema: S, data: FormData | Record<string, unknown>): Promise<Validation<InferOutput<S>>>

interface Field
{
    readonly errors: ReadableSignal<readonly string[]>
    readonly error: ReadableSignal<string | undefined>
    readonly invalid: ReadableSignal<boolean>
}

interface Form
{
    readonly status: ReadableSignal<FormStatus>
    readonly pending: ReadableSignal<boolean>
    readonly problem: ReadableSignal<Problem | undefined>
    readonly result: ReadableSignal<unknown>
    readonly error: ReadableSignal<unknown>
    field(name: string): Field
    submit(event: SubmitEvent): void
    reset(): void
}

interface FormOptions
{
    schema?: StandardSchema
    send?: (submission: Submission) => Promise<Response>
    headers?: HeadersInit
    fetch?: typeof fetch
    navigate?: (url: string) => void
    reset?: boolean
    onSuccess?: (outcome: SubmissionOutcome) => void
    onFailure?: (problem: Problem, element: HTMLFormElement) => void
    onError?: (error: unknown, element: HTMLFormElement) => void
}

interface StandardIssue
{
    readonly message: string
    readonly path?: ReadonlyArray<PropertyKey | StandardPathSegment> | undefined
}

interface StandardPathSegment
{
    readonly key: PropertyKey
}

interface StandardSchema<Input = unknown, Output = Input>
{
    readonly "~standard": { readonly version: 1; readonly vendor: string; readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>; readonly types?: { readonly input: Input; readonly output: Output } | undefined }
}

interface Submission
{
    readonly element: HTMLFormElement
    readonly submitter: HTMLElement | null
    readonly data: FormData
    readonly method: string
    readonly action: URL
    readonly signal: AbortSignal
}

interface SubmissionOutcome
{
    readonly result: unknown
    readonly response: Response
    readonly element: HTMLFormElement
}

type FormStatus = "idle" | "pending" | "success" | "failure" | "error"
type FormValues = Record<string, FormDataEntryValue | FormDataEntryValue[]>
type InferOutput<S extends StandardSchema> = S extends StandardSchema<unknown, infer Output> ? Output : never
type StandardResult<Output> = { readonly value: Output; readonly issues?: undefined } | { readonly issues: ReadonlyArray<StandardIssue> }
type Validation<Output> = { readonly value: Output; readonly problem?: undefined } | { readonly value?: undefined; readonly problem: Problem }
```
