/**
 * Path patterns. A pattern is a sequence of static segments and `:name`
 * parameters, with an optional trailing `*rest` that captures the remainder.
 * Matching is pure so it can be tested without a DOM.
 */

/** The parameter names in a path pattern, derived at the type level. */
export type ParamsOf<Path extends string> =
    Path extends `${infer Head}/${infer Rest}`
        ? ParamsOf<Head> & ParamsOf<Rest>
        : Path extends `:${infer Name}`
            ? { [K in Name]: string }
            : Path extends `*${infer Name}`
                ? { [K in Name]: string }
                : {};

/** A compiled pattern. */
export interface Pattern
{
    readonly source: string;
    readonly names: readonly string[];
    readonly expression: RegExp;
}

function escape(segment: string): string
{
    return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compiles a pattern once. */
export function compile(path: string): Pattern
{
    const names: string[] = [];
    const parts: string[] = [];
    for (const segment of path.split("/"))
    {
        if (segment === "")
        {
            continue;
        }
        if (segment.startsWith(":"))
        {
            names.push(segment.slice(1));
            parts.push("([^/]+)");
        }
        else if (segment.startsWith("*"))
        {
            names.push(segment.slice(1));
            parts.push("(.*)");
        }
        else
        {
            parts.push(escape(segment));
        }
    }
    return { source: path, names, expression: new RegExp("^/" + parts.join("/") + "/?$") };
}

/** Matches a pathname against a compiled pattern and returns the decoded parameters, or undefined; a malformed percent escape in a parameter does not match, so the next route or the fallback answers. */
export function match(pattern: Pattern, pathname: string): Record<string, string> | undefined
{
    const result = pattern.expression.exec(pathname === "" ? "/" : pathname);
    if (result === null)
    {
        return undefined;
    }
    const params: Record<string, string> = {};
    for (let i = 0; i < pattern.names.length; i++)
    {
        const name = pattern.names[i] ?? "";
        const value = result[i + 1] ?? "";
        try
        {
            params[name] = decodeURIComponent(value);
        }
        catch
        {
            return undefined;
        }
    }
    return params;
}

/** Builds a pathname from a pattern and parameters, reading the segments as `compile` does: a `:name` value is encoded whole, and a `*rest` value one segment at a time, so its slashes stay slashes. */
export function build(path: string, params: Readonly<Record<string, string>>): string
{
    return path
        .split("/")
        .map((segment) =>
        {
            if (segment.startsWith(":"))
            {
                return encodeURIComponent(params[segment.slice(1)] ?? "");
            }
            if (segment.startsWith("*"))
            {
                return (params[segment.slice(1)] ?? "").split("/").map(encodeURIComponent).join("/");
            }
            return segment;
        })
        .join("/");
}
