/**
 * Puts two builds of the site together as one: the stable release's build
 * at the root and a pre-release's build under /next/, each made by
 * build.ts for its own base path. Where a page exists in one build only,
 * the version switch on its counterpart points at that build's home
 * instead; and a diagnostic code's page that exists only under /next/ gets
 * a page at the root that sends the reader there, so the URL a pre-release
 * prints for a new code never comes back not found.
 *   node scripts/docs/compose.ts <stable-site> <next-site> <out>
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** The attribute the header puts on the version switch, whose target the composition checks. */
export const SWITCH = "data-version-switch";

/** Every HTML page of a built site as its site path, `/` for the root page and `/guide/` for guide/index.html. */
export async function pagesOf(site: string): Promise<Set<string>>
{
    const found = new Set<string>();
    const walk = async (folder: string): Promise<void> =>
    {
        for (const entry of await readdir(folder, { withFileTypes: true }))
        {
            const path = join(folder, entry.name);
            if (entry.isDirectory())
            {
                await walk(path);
            }
            else if (entry.name === "index.html")
            {
                const parent = relative(site, dirname(path)).split(sep).filter((part) => part !== "").join("/");
                found.add(parent === "" ? "/" : `/${parent}/`);
            }
        }
    };
    await walk(site);
    return found;
}

/**
 * Points each page's version switch at the same page in the other build
 * when that page exists there, and at the other build's home otherwise.
 * The switch is written with the other build's base and the page's own
 * path; `otherBase` is that base and `otherPages` the pages under it.
 */
export function retarget(html: string, path: string, otherBase: string, otherPages: ReadonlySet<string>): string
{
    const target = otherPages.has(path) ? `${otherBase}${path.slice(1)}` : otherBase;
    return html.replace(/(<a\b[^>]*?\bhref=")([^"]*)("[^>]*\bdata-version-switch\b)/g, (_, open: string, _href: string, close: string) => `${open}${target}${close}`);
}

/** A page at a stable site's path that sends the reader to the same path under `/next/`, for a diagnostic code the pre-release alone has. */
export function redirectPage(path: string, nextBase: string): string
{
    const target = `${nextBase}${path.slice(1)}`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${target}">
<title>Moved to the pre-release docs</title>
</head>
<body>
<p>This page is in the pre-release docs: <a href="${target}">${target}</a>.</p>
</body>
</html>
`;
}

/** Retargets the version switch of every page of a built site at `site`, whose pages are `pages`, toward the other build at `otherBase` with the pages `otherPages`. */
async function rewrite(site: string, pages: ReadonlySet<string>, otherBase: string, otherPages: ReadonlySet<string>): Promise<void>
{
    for (const path of pages)
    {
        const file = join(site, ...path.split("/").filter((part) => part !== ""), "index.html");
        const html = await readFile(file, "utf8");
        const updated = retarget(html, path, otherBase, otherPages);
        if (updated !== html)
        {
            await writeFile(file, updated);
        }
    }
}

/** Composes `stable` and `next` into `out`: the stable build at the root of the artifact, served under `stableBase`, the next build in the folder `nextBase` names under it, the switches retargeted, and the root pointing at pre-release-only diagnostic pages. */
export async function compose(stable: string, next: string | undefined, out: string, stableBase = "/", nextBase = "/next/"): Promise<{ pages: number; redirects: number }>
{
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    await cp(stable, out, { recursive: true });
    const stablePages = await pagesOf(stable);
    if (next === undefined)
    {
        return { pages: stablePages.size, redirects: 0 };
    }
    const nextFolder = nextBase.startsWith(stableBase) ? nextBase.slice(stableBase.length) : nextBase;
    const nextOut = join(out, ...nextFolder.split("/").filter((part) => part !== ""));
    await cp(next, nextOut, { recursive: true });
    const nextPages = await pagesOf(next);
    await rewrite(out, stablePages, nextBase, nextPages);
    await rewrite(nextOut, nextPages, stableBase, stablePages);
    let redirects = 0;
    for (const path of nextPages)
    {
        if (!path.startsWith("/e/") || path === "/e/" || stablePages.has(path))
        {
            continue;
        }
        const folder = join(out, ...path.split("/").filter((part) => part !== ""));
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, "index.html"), redirectPage(path, nextBase));
        await writeFile(join(folder, "index.md"), `# Moved\n\nThis page is in the pre-release docs: ${nextBase}${path.slice(1)}index.md\n`);
        redirects++;
    }
    return { pages: stablePages.size + nextPages.size, redirects };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
    const [stable, next, out, stableBase, nextBase] = process.argv.slice(2);
    if (stable === undefined || out === undefined)
    {
        console.error("usage: node scripts/docs/compose.ts <stable-site> <next-site or -> <out> [stable-base] [next-base]");
        process.exit(2);
    }
    const nextSite = next === undefined || next === "-" ? undefined : next;
    if (nextSite !== undefined)
    {
        await stat(nextSite);
    }
    const result = await compose(stable, nextSite, out, stableBase ?? "/", nextBase ?? "/next/");
    console.log(`compose: ${result.pages} pages into ${out}${nextSite === undefined ? "" : `, with the pre-release under /next/ and ${result.redirects} diagnostic pages pointing there`}`);
}
