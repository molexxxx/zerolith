/**
 * The path the docs site is served under: `/` at the root of a domain, or
 * `/zerolith/` on a GitHub Pages project site. Pages are built with
 * root-relative URLs, checked that way, and rebased only when written, so
 * the link check and the search test do not depend on where the site is
 * hosted.
 */

/** Normalizes a base path to start and end with a slash; an empty value means the root. */
export function normalizeBase(value: string | undefined): string
{
    const trimmed = (value ?? "").trim().replace(/^\/+|\/+$/g, "");
    return trimmed === "" ? "/" : `/${trimmed}/`;
}

/** A root-relative path under the base. */
export function rebasePath(path: string, base: string): string
{
    return base === "/" || !path.startsWith("/") || path.startsWith("//") ? path : base + path.slice(1);
}

/** Rebases the root-relative `href` and `src` attributes of a page and the import map entry for zerolith. */
export function rebaseHtml(html: string, base: string): string
{
    if (base === "/")
    {
        return html;
    }
    return html
        .replace(/\b(href|src)="\/(?!\/)/g, `$1="${base}`)
        .replace(/"zerolith":"\/(?!\/)/g, `"zerolith":"${base}`);
}

/** Rebases the root-relative link targets of Markdown, leaving fenced code alone. */
export function rebaseMarkdown(markdown: string, base: string): string
{
    if (base === "/")
    {
        return markdown;
    }
    let fenced = false;
    return markdown
        .split("\n")
        .map((line) =>
        {
            if (line.trimStart().startsWith("```"))
            {
                fenced = !fenced;
                return line;
            }
            return fenced ? line : line.replace(/\]\(\/(?!\/)/g, `](${base}`);
        })
        .join("\n");
}
