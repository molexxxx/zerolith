/**
 * The enhancer. A form stays a native `<form>` that posts to its action and
 * works without JavaScript; `createForm` takes over its submit event when
 * JavaScript runs, sends the same request with `fetch`, and exposes the
 * outcome as signals: pending state, a parsed result, or a problem whose
 * `fields` feed the inputs that failed.
 */
import { PROBLEM_MEDIA_TYPE, type Problem, type ReadableSignal, batch, computed, isProblem, signal } from "zerolith";
import { type StandardSchema, validateForm } from "./schema.js";

/** Where a form is in its current submission. */
export type FormStatus = "idle" | "pending" | "success" | "failure" | "error";

/** What the default sender, or a custom `send`, receives. */
export interface Submission
{
    /** The form that was submitted. */
    readonly element: HTMLFormElement;
    /** The button or input that submitted it, when there was one. */
    readonly submitter: HTMLElement | null;
    /** The form's data, including the submitter's name and value. */
    readonly data: FormData;
    /** The lowercase method, after the submitter's `formmethod` override. */
    readonly method: string;
    /** The resolved action URL, after the submitter's `formaction` override. */
    readonly action: URL;
    /** Aborted when the form is submitted again or reset. */
    readonly signal: AbortSignal;
}

/** The outcome of one submission. */
export interface SubmissionOutcome
{
    /** The parsed body: JSON when the response says so, text otherwise, undefined for an empty body. */
    readonly result: unknown;
    readonly response: Response;
    readonly element: HTMLFormElement;
}

/** Options for `createForm`. */
export interface FormOptions
{
    /** Validated on the client before anything is sent; failing issues become the problem's `fields`. */
    schema?: StandardSchema;
    /** Sends the submission. Defaults to a `fetch` of the form's method, action, and encoding that asks for JSON. */
    send?: (submission: Submission) => Promise<Response>;
    /** Headers added to the default request. */
    headers?: HeadersInit;
    /** The `fetch` the default sender uses; defaults to the global one. */
    fetch?: typeof fetch;
    /** Where a redirected response takes the page. Defaults to `location.assign`; pass the router's `navigate` to stay in the application. */
    navigate?: (url: string) => void;
    /** Resets the form element after a successful response. */
    reset?: boolean;
    /** Called after a successful response. */
    onSuccess?: (outcome: SubmissionOutcome) => void;
    /** Called with the problem from client-side validation or from the server. */
    onFailure?: (problem: Problem, element: HTMLFormElement) => void;
    /** Called when the request itself fails. */
    onError?: (error: unknown, element: HTMLFormElement) => void;
}

/** One input's slice of the current problem. */
export interface Field
{
    /** Every message for the field, oldest first. */
    readonly errors: ReadableSignal<readonly string[]>;
    /** The first message, or undefined. */
    readonly error: ReadableSignal<string | undefined>;
    /** True while the field has a message; bind it to `aria-invalid`. */
    readonly invalid: ReadableSignal<boolean>;
}

/** The enhanced form. */
export interface Form
{
    readonly status: ReadableSignal<FormStatus>;
    /** True while a submission is in flight. */
    readonly pending: ReadableSignal<boolean>;
    /** The problem from the last failed submission, or undefined. */
    readonly problem: ReadableSignal<Problem | undefined>;
    /** The parsed body of the last successful submission. */
    readonly result: ReadableSignal<unknown>;
    /** The error of the last submission that did not complete. */
    readonly error: ReadableSignal<unknown>;
    /** A field's view of the problem; the same object for the same name. */
    field(name: string): Field;
    /** The submit handler; bind it with `@submit`. */
    submit(event: SubmitEvent): void;
    /** Aborts any submission in flight and returns the form to idle. */
    reset(): void;
}

const EMPTY: readonly string[] = [];

function entries(data: FormData): [string, string][]
{
    return [...data].map(([name, value]) => [name, typeof value === "string" ? value : value.name]);
}

async function defaultSend(submission: Submission, headers: HeadersInit | undefined, fetchImpl: typeof fetch): Promise<Response>
{
    const { element, submitter, data, method, action, signal: abort } = submission;
    const requestHeaders = new Headers(headers);
    if (!requestHeaders.has("accept"))
    {
        requestHeaders.set("accept", `application/json, ${PROBLEM_MEDIA_TYPE}`);
    }
    const init: RequestInit = { method: method.toUpperCase(), headers: requestHeaders, signal: abort, credentials: "same-origin" };
    if (method === "get")
    {
        const url = new URL(action);
        url.search = new URLSearchParams(entries(data)).toString();
        return fetchImpl(url, init);
    }
    const enctype = submitter?.getAttribute("formenctype") ?? element.enctype;
    if (enctype === "multipart/form-data")
    {
        init.body = data;
    }
    else if (enctype === "text/plain")
    {
        requestHeaders.set("content-type", "text/plain; charset=utf-8");
        init.body = entries(data).map(([name, value]) => `${name}=${value}\r\n`).join("");
    }
    else
    {
        init.body = new URLSearchParams(entries(data));
    }
    return fetchImpl(action, init);
}

async function parseBody(response: Response): Promise<unknown>
{
    if (response.status === 204 || response.status === 205)
    {
        return undefined;
    }
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("json"))
    {
        return response.json();
    }
    const text = await response.text();
    return text === "" ? undefined : text;
}

/**
 * Creates the enhancer for one form. Bind `submit` to the form's `@submit`;
 * the method, action, and encoding stay on the form element, so the same
 * markup submits natively when the script has not run.
 */
export function createForm(options: FormOptions = {}): Form
{
    const status = signal<FormStatus>("idle");
    const problem = signal<Problem | undefined>(undefined);
    const result = signal<unknown>(undefined);
    const error = signal<unknown>(undefined);
    const pending = computed(() => status.get() === "pending");
    const fields = new Map<string, Field>();
    let controller: AbortController | undefined;

    const fail = (found: Problem, element: HTMLFormElement): void =>
    {
        batch(() =>
        {
            problem.set(found);
            status.set("failure");
        });
        options.onFailure?.(found, element);
    };

    const run = async (element: HTMLFormElement, submitter: HTMLElement | null, method: string, action: URL, current: AbortController): Promise<void> =>
    {
        const data = new FormData(element, submitter ?? undefined);
        batch(() =>
        {
            status.set("pending");
            problem.set(undefined);
            error.set(undefined);
        });
        if (options.schema !== undefined)
        {
            const validation = await validateForm(options.schema, data);
            if (current.signal.aborted)
            {
                return;
            }
            if (validation.problem !== undefined)
            {
                fail(validation.problem, element);
                return;
            }
        }
        const submission: Submission = { element, submitter, data, method, action, signal: current.signal };
        const response = await (options.send ?? ((request) => defaultSend(request, options.headers, options.fetch ?? fetch)))(submission);
        if (current.signal.aborted)
        {
            return;
        }
        const type = response.headers.get("content-type") ?? "";
        if (type.includes(PROBLEM_MEDIA_TYPE))
        {
            fail((await response.json()) as Problem, element);
            return;
        }
        if (!response.ok)
        {
            const body = type.includes("json") ? await response.json().catch(() => undefined) : undefined;
            fail(isProblem(body) ? body : { status: response.status, title: response.statusText === "" ? `HTTP ${response.status}` : response.statusText }, element);
            return;
        }
        const parsed = response.redirected ? undefined : await parseBody(response);
        if (current.signal.aborted)
        {
            return;
        }
        batch(() =>
        {
            result.set(parsed);
            status.set("success");
        });
        if (options.reset === true)
        {
            element.reset();
        }
        options.onSuccess?.({ result: parsed, response, element });
        if (response.redirected)
        {
            (options.navigate ?? ((url) => location.assign(url)))(response.url);
        }
    };

    return {
        status,
        pending,
        problem,
        result,
        error,
        field(name: string): Field
        {
            let field = fields.get(name);
            if (field === undefined)
            {
                const errors = computed<readonly string[]>(() => problem.get()?.fields?.[name] ?? EMPTY);
                field = {
                    errors,
                    error: computed(() => errors.get()[0]),
                    invalid: computed(() => errors.get().length > 0)
                };
                fields.set(name, field);
            }
            return field;
        },
        submit(event: SubmitEvent): void
        {
            const element = event.currentTarget as HTMLFormElement;
            const submitter = event.submitter;
            const method = (submitter?.getAttribute("formmethod") ?? element.getAttribute("method") ?? "get").toLowerCase();
            if (method === "dialog")
            {
                return;
            }
            event.preventDefault();
            const action = new URL(submitter?.hasAttribute("formaction") === true ? (submitter as HTMLButtonElement).formAction : element.action);
            controller?.abort();
            const current = new AbortController();
            controller = current;
            run(element, submitter, method, action, current).catch((thrown: unknown) =>
            {
                if (current.signal.aborted)
                {
                    return;
                }
                batch(() =>
                {
                    error.set(thrown);
                    status.set("error");
                });
                options.onError?.(thrown, element);
            });
        },
        reset(): void
        {
            controller?.abort();
            controller = undefined;
            batch(() =>
            {
                status.set("idle");
                problem.set(undefined);
                result.set(undefined);
                error.set(undefined);
            });
        }
    };
}
