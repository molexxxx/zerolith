/**
 * The failure shape forms speak: RFC 9457 problem details with a `fields`
 * extension member that carries the messages for each named input. The
 * server answers a failed submission with it, client-side validation
 * produces the same document, and one handler serves both.
 */

/** Messages per field name, as the `fields` extension member of a problem. */
export type FieldErrors = Readonly<Record<string, readonly string[]>>;

/** An RFC 9457 problem details document with the `fields` extension. */
export interface Problem
{
    /** A URI identifying the problem type; `about:blank` when the status says it all. */
    type?: string;
    /** A short human-readable summary. */
    title?: string;
    /** The HTTP status code. */
    status?: number;
    /** A human-readable explanation specific to this occurrence. */
    detail?: string;
    /** A URI identifying this occurrence. */
    instance?: string;
    /** Validation messages per field name. */
    fields?: FieldErrors;
}

/** The media type of a problem details document. */
export const PROBLEM_MEDIA_TYPE: string = "application/problem+json";

/** True for an object that carries at least one problem details member with the right type. */
export function isProblem(value: unknown): value is Problem
{
    if (value === null || typeof value !== "object" || Array.isArray(value))
    {
        return false;
    }
    const record = value as Record<string, unknown>;
    const typed = (key: string, kind: "string" | "number"): boolean => key in record && typeof record[key] === kind;
    const fields = record["fields"];
    const hasFields = fields !== null && typeof fields === "object" && !Array.isArray(fields);
    return typed("title", "string") || typed("status", "number") || typed("detail", "string") || typed("type", "string") || hasFields;
}

/**
 * Writes a problem as a `Response` with the problem details media type.
 * The status comes from the problem, or `init`, or defaults to 400.
 */
export function problemResponse(problem: Problem, init: ResponseInit = {}): Response
{
    const status = init.status ?? problem.status ?? 400;
    const headers = new Headers(init.headers);
    headers.set("content-type", `${PROBLEM_MEDIA_TYPE}; charset=utf-8`);
    const body: Problem = { ...problem, status };
    return new Response(JSON.stringify(body), { ...init, status, headers });
}
