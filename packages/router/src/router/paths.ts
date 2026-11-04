/**
 * Path helpers: the base path the application is served under, trailing
 * slashes, and fragments.
 */

/** A base path with one leading and one trailing slash; an empty or relative base is the root. */
export function normalizeBase(base: string | undefined): string
{
    const trimmed = (base ?? "/").trim();
    if (trimmed === "" || trimmed.startsWith("."))
    {
        return "/";
    }
    let start = 0;
    let end = trimmed.length;
    while (start < end && trimmed[start] === "/")
    {
        start++;
    }
    while (end > start && trimmed[end - 1] === "/")
    {
        end--;
    }
    const inner = trimmed.slice(start, end);
    return inner === "" ? "/" : `/${inner}/`;
}

/** A path without its trailing slash, except the root, so `/settings` and `/settings/` compare equal as the matcher reads them. */
export function withoutTrailingSlash(path: string): string
{
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** A fragment percent-decoded, or as it is when its escapes are malformed, as in `#100%`. */
export function decoded(fragment: string): string
{
    try
    {
        return decodeURIComponent(fragment);
    }
    catch
    {
        return fragment;
    }
}
