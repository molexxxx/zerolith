# @zerolith/client

function createClient<A extends Contract<A>>(routes: RouteTable<A>, _): Client<A>
class ProblemError extends Error
    constructor(problem: Problem, response: Response)
    readonly problem: Problem
    readonly response: Response
interface CallOptions
    signal?: AbortSignal
    headers?: HeadersInit
interface Client<A extends Contract<A>>
    call(name: K, ...args: InputArgs<A[K]>): Promise<Output<A[K]>>
    query(name: K, input: () => Input<A[K]> | undefined, options?: CallOptions): Resource<Output<A[K]>>
    request(name: K, ...args: InputArgs<A[K]>): Request
interface ClientOptions
    baseUrl?: string
    transport?: Transport
    headers?: HeadersInit | (() => HeadersInit)
interface Operation
    readonly method: Method
    readonly path: string
    readonly params?: Record<string, string | number | boolean>
    readonly query?: Record<string, unknown>
    readonly body?: unknown
    readonly output: unknown
type Contract<A> = { readonly [K in keyof A]: Operation }
type Input<Op extends Operation> = Omit<Op, "method" | "path" | "output">
type Method = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace" | "query"
type Output<Op extends Operation> = Op["output"]
type RouteTable<A extends Contract<A>> = { readonly [K in keyof A]: { readonly method: A[K]["method"]; readonly path: A[K]["path"] } }
type Transport = (request: Request) => Promise<Response>
