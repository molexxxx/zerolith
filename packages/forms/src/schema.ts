/**
 * Validation through Standard Schema, the interface that zod, valibot,
 * arktype, and others implement, so a schema written once validates a
 * submission in the browser before it is sent and on the server when it
 * arrives, producing the same problem document in both places.
 */
import type { FieldErrors, Problem } from "zerolith";

/** One segment of an issue path in object form. */
export interface StandardPathSegment
{
    readonly key: PropertyKey;
}

/** One validation failure. */
export interface StandardIssue
{
    readonly message: string;
    /** The path to the failing value; absent for an issue about the whole input. */
    readonly path?: ReadonlyArray<PropertyKey | StandardPathSegment> | undefined;
}

/** What `validate` resolves to: a value, or issues. */
export type StandardResult<Output> =
    | { readonly value: Output; readonly issues?: undefined }
    | { readonly issues: ReadonlyArray<StandardIssue> };

/** The Standard Schema V1 interface, as published at standardschema.dev. */
export interface StandardSchema<Input = unknown, Output = Input>
{
    readonly "~standard": {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
        readonly types?: { readonly input: Input; readonly output: Output } | undefined;
    };
}

/** The output type of a schema. */
export type InferOutput<S extends StandardSchema> = S extends StandardSchema<unknown, infer Output> ? Output : never;

/** A form's values as a plain object: repeated names become arrays. */
export type FormValues = Record<string, FormDataEntryValue | FormDataEntryValue[]>;

/** What `validateForm` resolves to: the parsed value, or the problem to show. */
export type Validation<Output> =
    | { readonly value: Output; readonly problem?: undefined }
    | { readonly value?: undefined; readonly problem: Problem };

/** Turns `FormData` into a plain object. A name that appears once maps to its value; a name that appears more than once maps to an array of its values, in order. */
export function formValues(data: FormData): FormValues
{
    const values: FormValues = {};
    for (const [name, value] of data)
    {
        const current = values[name];
        if (current === undefined)
        {
            values[name] = value;
        }
        else if (Array.isArray(current))
        {
            current.push(value);
        }
        else
        {
            values[name] = [current, value];
        }
    }
    return values;
}

function fieldName(path: ReadonlyArray<PropertyKey | StandardPathSegment> | undefined): string | undefined
{
    if (path === undefined || path.length === 0)
    {
        return undefined;
    }
    return path.map((segment) => String(typeof segment === "object" ? segment.key : segment)).join(".");
}

/** Groups issues into a problem: path-bearing issues under `fields`, the rest in `detail`. */
export function problemFromIssues(issues: ReadonlyArray<StandardIssue>): Problem
{
    const fields: Record<string, string[]> = {};
    const general: string[] = [];
    for (const issue of issues)
    {
        const name = fieldName(issue.path);
        if (name === undefined)
        {
            general.push(issue.message);
            continue;
        }
        (fields[name] ??= []).push(issue.message);
    }
    const problem: Problem = { type: "about:blank", title: "The submission has invalid fields", status: 400, fields: fields as FieldErrors };
    if (general.length > 0)
    {
        problem.detail = general.join(" ");
    }
    return problem;
}

/**
 * Validates a submission with a Standard Schema. `FormData` is converted
 * with `formValues` first; any other value is validated as it is. Issues
 * become a problem whose `fields` carry the messages per path.
 */
export async function validateForm<S extends StandardSchema>(schema: S, data: FormData | Record<string, unknown>): Promise<Validation<InferOutput<S>>>
{
    const input = data instanceof FormData ? formValues(data) : data;
    const result = await schema["~standard"].validate(input);
    if (result.issues !== undefined && result.issues.length > 0)
    {
        return { problem: problemFromIssues(result.issues) };
    }
    return { value: (result as { value: InferOutput<S> }).value };
}
