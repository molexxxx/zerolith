/**
 * Builds the documentation site into site/. Guides come from docs/guide,
 * executed examples from test files by region, the API reference from the
 * sources through deno doc, and the diagnostics pages from the runtime's
 * own catalog. Every page gets a Markdown twin, llms.txt indexes them, and
 * a broken internal link or a missing example fails the build.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { diagnosticCatalog } from "zerolith";
import { type NavSection, type PageData, globalStyles, markdownTwin, renderPage } from "./layout.ts";
import { type Entry, type ManifestSymbol, extract, referencePage, symbolsOf } from "./reference.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = join(root, "site");

const entries: Entry[] = [
    { specifier: "zerolith", file: "packages/zerolith/src/index.ts", title: "zerolith" },
    { specifier: "zerolith/ssr", file: "packages/zerolith/src/ssr.ts", title: "zerolith/ssr" },
    { specifier: "@zerolith/router", file: "packages/router/src/index.ts", title: "@zerolith/router" },
    { specifier: "@zerolith/router/server", file: "packages/router/src/server.ts", title: "@zerolith/router/server" },
    { specifier: "@zerolith/devtools", file: "packages/devtools/src/index.ts", title: "@zerolith/devtools" },
    { specifier: "@zerolith/vite", file: "packages/vite/src/index.ts", title: "@zerolith/vite" },
    { specifier: "@zerolith/vite/runtime", file: "packages/vite/src/runtime.ts", title: "@zerolith/vite/runtime" },
    { specifier: "@zerolith/forms", file: "packages/forms/src/index.ts", title: "@zerolith/forms" },
    { specifier: "@zerolith/client", file: "packages/client/src/index.ts", title: "@zerolith/client" },
    { specifier: "@zerolith/client/generate", file: "packages/client/src/generate.ts", title: "@zerolith/client/generate" }
];

interface Page
{
    path: string;
    title: string;
    description: string;
    markdown: string;
    section: "Guide" | "Reference" | "Diagnostics";
    order: number;
}

function slug(text: string): string
{
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

marked.use({
    gfm: true,
    renderer: {
        heading({ tokens, depth })
        {
            const text = this.parser.parseInline(tokens);
            return `<h${depth} id="${slug(text.replace(/<[^>]+>/g, ""))}">${text}</h${depth}>\n`;
        }
    }
});

interface FrontMatter
{
    title: string;
    description: string;
    order: number;
    body: string;
}

function frontMatter(source: string, file: string): FrontMatter
{
    const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
    if (match === null)
    {
        throw new Error(`${file}: missing front matter`);
    }
    const fields = new Map<string, string>();
    for (const line of (match[1] ?? "").split("\n"))
    {
        const colon = line.indexOf(":");
        if (colon > 0)
        {
            fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
        }
    }
    const title = fields.get("title");
    const description = fields.get("description");
    if (title === undefined || description === undefined)
    {
        throw new Error(`${file}: front matter needs title and description`);
    }
    return { title, description, order: Number(fields.get("order") ?? 100), body: source.slice(match[0].length) };
}

/** Replaces `@include path#region` lines with the region's code from the file, dedented, as a fenced block. */
async function includeExample(path: string, region: string, file: string): Promise<string>
{
    const source = await readFile(join(root, path), "utf8");
    const start = source.indexOf(`// #region ${region}`);
    const end = source.indexOf(`// #endregion ${region}`);
    if (start === -1 || end === -1 || end < start)
    {
        throw new Error(`${file}: region ${region} not found in ${path}`);
    }
    const body = source.slice(source.indexOf("\n", start) + 1, end).replace(/\n\s*$/, "");
    const indent = Math.min(...body.split("\n").filter((text) => text.trim() !== "").map((text) => /^\s*/.exec(text)?.[0].length ?? 0));
    const code = body.split("\n").map((text) => text.slice(indent)).join("\n");
    const language = path.endsWith(".js") ? "js" : "ts";
    return "```" + language + "\n" + code + "\n```";
}

async function includeExamples(markdown: string, file: string): Promise<string>
{
    const lines = await Promise.all(markdown.split("\n").map((line) =>
    {
        const match = /^@include\s+(\S+)#(\S+)\s*$/.exec(line);
        return match === null ? Promise.resolve(line) : includeExample(match[1] ?? "", match[2] ?? "", file);
    }));
    return lines.join("\n");
}

async function guides(): Promise<Page[]>
{
    const folder = join(root, "docs", "guide");
    const names = (await readdir(folder)).filter((name) => name.endsWith(".md"));
    const pages = await Promise.all(names.map(async (name): Promise<Page> =>
    {
        const { title, description, order, body } = frontMatter(await readFile(join(folder, name), "utf8"), `docs/guide/${name}`);
        const path = name === "index.md" ? "/" : `/guide/${name.slice(0, -3)}/`;
        return { path, title, description, markdown: await includeExamples(body, `docs/guide/${name}`), section: "Guide", order };
    }));
    return pages.toSorted((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

async function reference(): Promise<{ pages: Page[]; manifest: ManifestSymbol[] }>
{
    const doc = await extract(root, entries);
    const pages: Page[] = [];
    const manifest: ManifestSymbol[] = [];
    for (const [index, entry] of entries.entries())
    {
        const symbols = symbolsOf(doc, root, entry);
        manifest.push(...symbols);
        pages.push({
            path: `/reference/${slug(entry.specifier)}/`,
            title: entry.title,
            description: `API reference for ${entry.specifier}: ${symbols.length} exports, generated from the source.`,
            markdown: referencePage(entry, symbols),
            section: "Reference",
            order: index
        });
    }
    return { pages, manifest };
}

function diagnostics(): Page[]
{
    const codes = Object.keys(diagnosticCatalog).toSorted();
    if (codes.length === 0)
    {
        throw new Error("the diagnostic catalog is empty; run the docs build with the development condition");
    }
    const index: Page = {
        path: "/e/",
        title: "Diagnostics",
        description: "Every diagnostic code zerolith can emit, with its cause and fix.",
        markdown: ["# Diagnostics", "", "Every error and warning carries a stable code and a link to its page here. The code and the URL are public API; the message text is not, and production builds omit it.", "", "| Code | Cause |", "| --- | --- |", ...codes.map((code) => `| [${code}](/e/${code}/) | ${diagnosticCatalog[code as keyof typeof diagnosticCatalog]?.cause ?? ""} |`)].join("\n"),
        section: "Diagnostics",
        order: 0
    };
    const pages = codes.map((code, order): Page =>
    {
        const text = diagnosticCatalog[code as keyof typeof diagnosticCatalog];
        return {
            path: `/e/${code}/`,
            title: code,
            description: text?.cause ?? code,
            markdown: ["# " + code, "", "## What happened", "", text?.cause ?? "", "", "## What to do", "", text?.fix ?? "", "", "The arguments of the specific occurrence are in the query string of the URL the error gave you."].join("\n"),
            section: "Diagnostics",
            order: order + 1
        };
    });
    return [index, ...pages];
}

function navigation(pages: Page[]): NavSection[]
{
    const sections: NavSection[] = [];
    for (const title of ["Guide", "Reference", "Diagnostics"] as const)
    {
        const items = pages.filter((page) => page.section === title && (title !== "Diagnostics" || page.path === "/e/"));
        sections.push({ title, pages: items.map((page) => ({ title: page.title, href: page.path })) });
    }
    return sections;
}

function checkLinks(pages: Page[], rendered: Map<string, string>): void
{
    const known = new Set<string>();
    for (const page of pages)
    {
        known.add(page.path);
        known.add(markdownTwin(page.path));
    }
    known.add("/styles.css");
    known.add("/llms.txt");
    known.add("/llms-full.txt");
    known.add("/api.json");
    const broken: string[] = [];
    for (const [path, html] of rendered)
    {
        for (const match of html.matchAll(/href="([^"]+)"/g))
        {
            const href = match[1] ?? "";
            if (!href.startsWith("/"))
            {
                continue;
            }
            const target = href.split("#")[0] ?? "";
            if (!known.has(target) && !known.has(target.endsWith("/") ? target : target + "/"))
            {
                broken.push(`${path} -> ${href}`);
            }
        }
    }
    if (broken.length > 0)
    {
        throw new Error(`broken internal links:\n${broken.join("\n")}`);
    }
}

async function write(path: string, content: string): Promise<void>
{
    const file = join(out, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
}

const start = performance.now();
await rm(out, { recursive: true, force: true });
const guidePages = await guides();
const { pages: referencePages, manifest } = await reference();
const pages = [...guidePages, ...referencePages, ...diagnostics()];
const nav = navigation(pages);
const rendered = new Map<string, string>();

await Promise.all(pages.map(async (page) =>
{
    const content = await marked.parse(page.markdown);
    const data: PageData = { title: page.title, description: page.description, path: page.path, content, nav };
    const html = renderPage(data);
    rendered.set(page.path, html);
    await Promise.all([
        write(page.path === "/" ? "index.html" : `${page.path}index.html`, html),
        write(markdownTwin(page.path), page.markdown + "\n")
    ]);
}));
checkLinks(pages, rendered);

await write("styles.css", globalStyles);
await write("api.json", JSON.stringify({ generated: new Date().toISOString(), symbols: manifest }, null, 2) + "\n");

const llms = ["# zerolith", "", "> A standalone frontend framework: fine-grained signals, HTML templates that need no compiler, typed routing, and tooling that works wherever the app is served.", ""];
for (const section of ["Guide", "Reference", "Diagnostics"] as const)
{
    llms.push(`## ${section}`, "");
    for (const page of pages.filter((candidate) => candidate.section === section))
    {
        llms.push(`- [${page.title}](${markdownTwin(page.path)}): ${page.description}`);
    }
    llms.push("");
}
await write("llms.txt", llms.join("\n"));
await write("llms-full.txt", pages.map((page) => page.markdown).join("\n\n\n") + "\n");

console.log(`docs: ${pages.length} pages, ${manifest.length} reference symbols, ${Math.round(performance.now() - start)} ms, written to site/`);
