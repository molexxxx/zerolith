import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SWITCH, compose, pagesOf, redirectPage, retarget } from "../compose.ts";

const scratch: string[] = [];

/** A built site in a temporary folder: a page per path, each holding the version switch pointing at `otherBase`. */
async function site(name: string, otherBase: string, paths: string[]): Promise<string>
{
    const folder = await mkdtemp(join(tmpdir(), `zerolith-compose-${name}-`));
    scratch.push(folder);
    for (const path of paths)
    {
        const dir = join(folder, ...path.split("/").filter((part) => part !== ""));
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "index.html"), `<html><body><a class="tag" href="${otherBase}${path.slice(1)}" ${SWITCH}>other</a><main>${name} ${path}</main></body></html>`);
        await writeFile(join(dir, "index.md"), `# ${name} ${path}\n`);
    }
    await writeFile(join(folder, "search.json"), "[]");
    return folder;
}

afterEach(async () =>
{
    await Promise.all(scratch.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe("composing the stable and the pre-release builds", () =>
{
    it("lists a site's pages by path", async () =>
    {
        const folder = await site("one", "/next/", ["/", "/guide/", "/e/foo/"]);
        expect([...await pagesOf(folder)].toSorted()).toEqual(["/", "/e/foo/", "/guide/"]);
    });

    it("points a switch at the same page in the other build, or at its home when the page is not there", () =>
    {
        const html = `<a href="/next/guide/" ${SWITCH}>2.0 alpha</a><a href="/other/">unrelated</a>`;
        expect(retarget(html, "/guide/", "/next/", new Set(["/", "/guide/"]))).toBe(`<a href="/next/guide/" ${SWITCH}>2.0 alpha</a><a href="/other/">unrelated</a>`);
        expect(retarget(html, "/guide/", "/next/", new Set(["/"]))).toBe(`<a href="/next/" ${SWITCH}>2.0 alpha</a><a href="/other/">unrelated</a>`);
        expect(retarget("<p>no switch</p>", "/guide/", "/next/", new Set())).toBe("<p>no switch</p>");
    });

    it("puts the pre-release under /next/, retargets both sides, and sends a pre-release-only diagnostic code there from the root", async () =>
    {
        const stable = await site("stable", "/next/", ["/", "/guide/", "/guide/old/", "/e/", "/e/known/"]);
        const next = await site("next", "/", ["/", "/guide/", "/guide/new/", "/e/", "/e/known/", "/e/fresh/"]);
        const out = join(await mkdtemp(join(tmpdir(), "zerolith-compose-out-")), "site");
        scratch.push(out);
        const result = await compose(stable, next, out);
        expect(result).toEqual({ pages: 11, redirects: 1 });
        expect(await readFile(join(out, "guide", "index.html"), "utf8")).toContain(`href="/next/guide/" ${SWITCH}`);
        expect(await readFile(join(out, "guide", "old", "index.html"), "utf8")).toContain(`href="/next/" ${SWITCH}`);
        expect(await readFile(join(out, "next", "guide", "new", "index.html"), "utf8")).toContain(`href="/" ${SWITCH}`);
        expect(await readFile(join(out, "next", "e", "known", "index.html"), "utf8")).toContain(`href="/e/known/" ${SWITCH}`);
        const redirect = await readFile(join(out, "e", "fresh", "index.html"), "utf8");
        expect(redirect).toContain("content=\"0; url=/next/e/fresh/\"");
        expect(redirect).toContain("<link rel=\"canonical\" href=\"/next/e/fresh/\">");
        expect(await readFile(join(out, "e", "fresh", "index.md"), "utf8")).toContain("/next/e/fresh/index.md");
        expect(await readFile(join(out, "e", "known", "index.html"), "utf8")).toContain("stable /e/known/");
        expect(await readFile(join(out, "next", "search.json"), "utf8")).toBe("[]");
    });

    it("composes a stable build alone when there is no pre-release", async () =>
    {
        const stable = await site("stable", "/next/", ["/", "/guide/"]);
        const out = join(await mkdtemp(join(tmpdir(), "zerolith-compose-out-")), "site");
        scratch.push(out);
        expect(await compose(stable, undefined, out)).toEqual({ pages: 2, redirects: 0 });
        expect(await readFile(join(out, "guide", "index.html"), "utf8")).toContain("stable /guide/");
    });

    it("writes a redirect page that names its target in the refresh, the canonical link, and the visible link", () =>
    {
        const page = redirectPage("/e/fresh/", "/next/");
        expect(page.match(/\/next\/e\/fresh\//g)?.length).toBe(4);
        expect(page).toContain("<!doctype html>");
    });
});
