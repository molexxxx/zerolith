/**
 * The failure shape the framework speaks over the wire: RFC 9457 problem
 * details, with a `fields` extension member that carries validation
 * messages per input. Servers answer failed requests with it, the typed
 * client throws it, forms show it, and client-side validation produces
 * the same document, so one handler serves every path.
 */

/** Messages per field name, the `fields` extension member of a problem. */
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
