/**
 * @zerolith/client: a typed HTTP client over a neutral contract. The route
 * table and the types come from `@zerolith/client/generate`, which reads an
 * OpenAPI document; the client itself knows nothing about the server beyond
 * its paths. Failures are RFC 9457 problems, thrown as `ProblemError`.
 */
import { PROBLEM_MEDIA_TYPE, type Problem, type Resource, isProblem, resource } from "zerolith";

/**
 * The HTTP method of an operation, in lowercase: one OpenAPI names, `query`
 * being the HTTP QUERY method, or any other method token, as an OpenAPI 3.2
 * `additionalOperations` entry such as `copy` gives.
 */
export type Method = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "query" | (string & {});

/** One operation as the generated `Api` interface describes it. */
export interface Operation
{
    /** The HTTP method in lowercase, such as `get`; the request sends it uppercased. */
    readonly method: Method;
    /** The path template, such as `/notes/{id}`, whose placeholders the client fills from `params` with URI-encoded values. */
    readonly path: string;
    /** Path parameters, by the name inside the braces. */
    readonly params?: Record<string, string | number | boolean>;
    /** Query parameters; arrays repeat the key, objects are JSON. */
    readonly query?: Record<string, unknown>;
    /** The request body; JSON unless it is a `FormData`, `URLSearchParams`, `Blob`, `ArrayBuffer`, `ReadableStream`, or string, which are sent as they are. */
    readonly body?: unknown;
    /** What a successful call resolves to. */
    readonly output: unknown;
}

/** What a generated `Api` interface satisfies: every member is an operation. */
export type Contract<A> = { readonly [K in keyof A]: Operation };

/** The runtime half of a contract: the method and path of every operation. */
export type RouteTable<A extends Contract<A>> = { readonly [K in keyof A]: { readonly method: A[K]["method"]; readonly path: A[K]["path"] } };

/** What a call takes: the operation's `params`, `query`, and `body`, as optional as the contract makes them. */
export type Input<Op extends Operation> = Omit<Op, "method" | "path" | "output">;

/** What a call resolves to. */
export type Output<Op extends Operation> = Op["output"];

/** Per-call options. */
export interface CallOptions
{
    /** Becomes the request's `signal`, so aborting it rejects the call under `fetch` or `portTransport`; `query` replaces it with the resource's own signal. */
    signal?: AbortSignal;
    /** Headers for this call, set over the client's `headers` so that a name in both takes this value; a `content-type` is left out for a `FormData` body, whose boundary the platform writes. */
    headers?: HeadersInit;
}

type InputArgs<Op extends Operation> = Record<never, never> extends Input<Op> ? [input?: Input<Op>, options?: CallOptions] : [input: Input<Op>, options?: CallOptions];

/** Sends a request. The default is `fetch`; a test or an Electron bridge can answer in process. */
export type Transport = (request: Request) => Promise<Response>;

/** Options for `createClient`. */
export interface ClientOptions
{
    /** Prepended to every path. Defaults to "", the page's origin in a browser; pass an absolute URL elsewhere. */
    baseUrl?: string;
    /** Sends every request the client builds and resolves with the response. Defaults to the global `fetch`, looked up on each call. */
    transport?: Transport;
    /** Headers sent with every request, or a function returning them, for values such as a bearer token; a `content-type` among them is left out for a `FormData` body, whose boundary the platform writes. */
    headers?: HeadersInit | (() => HeadersInit);
}

/** Thrown for a response outside 2xx, carrying the problem the server sent or one built from the status line. */
export class ProblemError extends Error
{
    /** The problem the server sent, with `status` filled from the response when the body omits it; a body that is not a JSON problem yields `status` and a `title` from the status line. */
    readonly problem: Problem;
    /** The response outside 2xx, for its status and headers; its body has already been read when the content type is JSON. */
    readonly response: Response;

    /** Wraps `problem` and the `response` it came from; the message is the problem's `title`, or `HTTP <status>` when it has none. */
    constructor(problem: Problem, response: Response)
    {
        super(problem.title ?? `HTTP ${response.status}`);
        this.name = "ProblemError";
        this.problem = problem;
        this.response = response;
    }
}

/** The client for one contract. */
export interface Client<A extends Contract<A>>
{
    /** Calls an operation and resolves with its output, or rejects with a `ProblemError` for a response outside 2xx. */
    call<K extends keyof A>(name: K, ...args: InputArgs<A[K]>): Promise<Output<A[K]>>;
    /** A resource over an operation: it calls again when the signals read by `input` change, and is idle while `input` returns undefined. */
    query<K extends keyof A>(name: K, input: () => Input<A[K]> | undefined, options?: CallOptions): Resource<Output<A[K]>>;
    /** The `Request` a call would send, for tests and custom transports. */
    request<K extends keyof A>(name: K, ...args: InputArgs<A[K]>): Request;
}

interface LooseInput
{
    params?: Record<string, string | number | boolean>;
    query?: Record<string, unknown>;
    body?: unknown;
}

function isRawBody(body: unknown): body is BodyInit
{
    return typeof body === "string" || body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body) || body instanceof ReadableStream;
}

function searchOf(query: Record<string, unknown>): string
{
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
    {
        if (value === undefined || value === null)
        {
            continue;
        }
        for (const item of Array.isArray(value) ? value : [value])
        {
            search.append(key, typeof item === "object" && item !== null ? JSON.stringify(item) : String(item));
        }
    }
    const text = search.toString();
    return text === "" ? "" : `?${text}`;
}

/** Whether this platform keeps a `ReadableStream` body as a stream: one that cannot turns it into the text "[object ReadableStream]" and labels it `text/plain`, as the streaming-requests guide for Chrome describes, or refuses it. */
function streamsBodies(): boolean
{
    try
    {
        const init: RequestInit & { duplex: "half" } = { method: "POST", body: new ReadableStream(), duplex: "half" };
        return !new Request("https://zerolith.invalid/", init).headers.has("content-type");
    }
    catch
    {
        return false;
    }
}

function buildRequest(route: { method: Method; path: string }, input: LooseInput, options: CallOptions, client: ClientOptions): Request
{
    const path = route.path.replace(/\{([^{}]+)\}/g, (_match, name: string) =>
    {
        const value = input.params?.[name];
        if (value === undefined)
        {
            throw new TypeError(`zerolith/client: ${route.method.toUpperCase()} ${route.path} needs the path parameter "${name}"`);
        }
        const segment = encodeURIComponent(String(value));
        if (segment === "." || segment === "..")
        {
            throw new TypeError(`zerolith/client: ${route.method.toUpperCase()} ${route.path} got "${segment}" for the path parameter "${name}", which would move the request to another path`);
        }
        return segment;
    });
    const base = (client.baseUrl ?? "").replace(/\/$/, "");
    const headers = new Headers(typeof client.headers === "function" ? client.headers() : client.headers);
    new Headers(options.headers).forEach((value, key) => headers.set(key, value));
    if (!headers.has("accept"))
    {
        headers.set("accept", `application/json, ${PROBLEM_MEDIA_TYPE}`);
    }
    const init: RequestInit = { method: route.method.toUpperCase(), headers };
    if (options.signal !== undefined)
    {
        init.signal = options.signal;
    }
    if (input.body !== undefined)
    {
        if (isRawBody(input.body))
        {
            init.body = input.body;
            if (input.body instanceof FormData)
            {
                headers.delete("content-type");
            }
            if (input.body instanceof ReadableStream)
            {
                if (!streamsBodies())
                {
                    throw new TypeError(`zerolith/client: ${route.method.toUpperCase()} ${route.path} has a ReadableStream body, which this platform cannot send as a stream; send a Blob or an ArrayBuffer`);
                }
                (init as RequestInit & { duplex: "half" }).duplex = "half";
            }
        }
        else
        {
            init.body = JSON.stringify(input.body);
            if (!headers.has("content-type"))
            {
                headers.set("content-type", "application/json");
            }
        }
    }
    return new Request(`${base}${path}${searchOf(input.query ?? {})}`, init);
}

/** A successful response's body: JSON parsed, text for `text/*` or no type, a `Blob` for any other type, such as an image, and `undefined` when it is empty. */
async function readBody(response: Response): Promise<unknown>
{
    if (response.status === 204 || response.status === 205)
    {
        return undefined;
    }
    const type = (response.headers.get("content-type") ?? "").toLowerCase();
    if (type.includes("json"))
    {
        return response.json();
    }
    if (type === "" || type.startsWith("text/"))
    {
        const text = await response.text();
        return text === "" ? undefined : text;
    }
    return response.blob();
}

/** Calls `run` with a signal that aborts when either `own` or `caller` does, and stops listening to the caller once the call settles. */
async function withSignals<T>(own: AbortSignal, caller: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T>
{
    if (caller === undefined)
    {
        return run(own);
    }
    const combined = new AbortController();
    const abort = (): void => combined.abort();
    if (own.aborted || caller.aborted)
    {
        combined.abort();
    }
    own.addEventListener("abort", abort);
    caller.addEventListener("abort", abort);
    try
    {
        return await run(combined.signal);
    }
    finally
    {
        own.removeEventListener("abort", abort);
        caller.removeEventListener("abort", abort);
    }
}

async function settle(response: Response): Promise<unknown>
{
    if (response.ok)
    {
        return readBody(response);
    }
    let problem: Problem | undefined;
    if ((response.headers.get("content-type") ?? "").includes("json"))
    {
        const body: unknown = await response.json().catch(() => undefined);
        if (isProblem(body))
        {
            problem = { status: response.status, ...body };
        }
    }
    throw new ProblemError(problem ?? { status: response.status, title: response.statusText === "" ? `HTTP ${response.status}` : response.statusText }, response);
}

/**
 * Creates a client for a generated route table. `routes` and the `Api`
 * type parameter come from the same generated module, so an operation
 * name, its parameters, its body, and its output are checked together.
 */
export function createClient<A extends Contract<A>>(routes: RouteTable<A>, options: ClientOptions = {}): Client<A>
{
    const transport: Transport = options.transport ?? ((request) => fetch(request));
    const request = (name: keyof A, input: LooseInput | undefined, callOptions: CallOptions | undefined): Request =>
    {
        const route = routes[name] as { method: Method; path: string } | undefined;
        if (route === undefined)
        {
            throw new TypeError(`zerolith/client: unknown operation "${String(name)}"`);
        }
        return buildRequest(route, input ?? {}, callOptions ?? {}, options);
    };
    const call = async (name: keyof A, input: LooseInput | undefined, callOptions: CallOptions | undefined): Promise<unknown> =>
    {
        return settle(await transport(request(name, input, callOptions)));
    };
    return {
        call<K extends keyof A>(name: K, ...args: InputArgs<A[K]>): Promise<Output<A[K]>>
        {
            return call(name, args[0] as LooseInput | undefined, args[1]) as Promise<Output<A[K]>>;
        },
        query<K extends keyof A>(name: K, input: () => Input<A[K]> | undefined, callOptions: CallOptions = {}): Resource<Output<A[K]>>
        {
            return resource<Input<A[K]>, Output<A[K]>>({
                params: input,
                loader: ({ params, abort }) => withSignals(abort, callOptions.signal, (signal) => call(name, params as LooseInput, { ...callOptions, signal }) as Promise<Output<A[K]>>)
            });
        },
        request<K extends keyof A>(name: K, ...args: InputArgs<A[K]>): Request
        {
            return request(name, args[0] as LooseInput | undefined, args[1]);
        }
    };
}
