/**
 * Links in the hand-written docs work in two places: on GitHub, which shows
 * the repository's Markdown files, and on the docs site. A page links
 * another page by its file, such as `structure.md` or `../learn/state.md`,
 * and anything only the site serves, such as a diagnostic page or
 * `llms.txt`, by its full address on the site. The site build turns both
 * into site paths, which it checks and rebases like every other link.
 */
import { posix } from "node:path";

/** Where the docs site lives. */
export const DOCS_URL = "https://molexxxx.github.io/zerolith/";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Calls `replace` with the target of every Markdown link outside code blocks and code spans, and keeps the rest of the text. */
export function mapLinks(markdown: string, replace: (target: string) => string): string
{
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
            if (fenced)
            {
                return line;
            }
            return line
                .split("`")
                .map((piece, index) => (index % 2 === 1 ? piece : piece.replace(/\]\(([^)\s]+)\)/g, (_, target: string) => `](${replace(target)})`)))
                .join("`");
        })
        .join("\n");
}

/**
 * The site path of a link on a page in `docs/<folder>`: `structure.md#x`
 * from `guide` is `/guide/structure/#x`, a full site address is its path,
 * and an outside address or an anchor is kept. Throws for a root-relative
 * link, which GitHub cannot resolve, and for a relative link to anything
 * other than a docs page.
 */
export function sitePath(target: string, folder: string, file: string): string
{
    if (target.startsWith(DOCS_URL))
    {
        return `/${target.slice(DOCS_URL.length)}`;
    }
    if (target.startsWith("/"))
    {
        throw new Error(`${file}: the link ${target} resolves on the docs site only; link the page's file, such as structure.md, or the full address ${DOCS_URL}${target.slice(1)}, so the link works on GitHub too`);
    }
    if (SCHEME.test(target) || target.startsWith("#"))
    {
        return target;
    }
    const hash = target.indexOf("#");
    const path = hash === -1 ? target : target.slice(0, hash);
    const anchor = hash === -1 ? "" : target.slice(hash);
    const page = /^(guide|learn)\/([a-z0-9-]+)\.md$/.exec(posix.normalize(posix.join(folder, path)));
    if (page === null)
    {
        throw new Error(`${file}: the link ${target} is not a page of the docs; link a file elsewhere in the repository by its full GitHub address`);
    }
    return `${page[2] === "index" ? `/${page[1]}/` : `/${page[1]}/${page[2]}/`}${anchor}`;
}
