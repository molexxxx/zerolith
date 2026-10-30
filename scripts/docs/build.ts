/**
 * Builds the documentation site into site/. Guides come from docs/guide,
 * executed examples from test files by region, the API reference from the
 * sources through deno doc, and the diagnostics pages from the runtime's
 * own catalog. Every page gets a Markdown twin, llms.txt indexes them, and
 * a broken internal link or a missing example fails the build.
 */
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { diagnosticCatalog } from "zerolith";
import { normalizeBase, rebaseHtml, rebaseMarkdown, rebasePath } from "./base.ts";
import { includeExamples } from "./examples.ts";
import { highlight } from "./highlight.ts";
import { type NavSection, type PageData, icon, markdownTwin, renderPage, siteStyles } from "./layout.ts";
import { type Entry, type ManifestSymbol, extract, referencePage, symbolsOf } from "./reference.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = join(root, "site");
/** Where the site is served: `ZEROLITH_DOCS_BASE`, `/` by default, `/zerolith/` on GitHub Pages. */
const base = normalizeBase(process.env["ZEROLITH_DOCS_BASE"]);
/** The version the site describes, shown in its header. */
const version = (JSON.parse(await readFile(join(root, "packages", "zerolith", "package.json"), "utf8")) as { version: string }).version;
const copyIcon = icon("copy");
const doneIcon = icon("check");
/** Files the site serves from brand/, by their path in the site. */
const brandAssets: Record<string, string> = {
    "favicon.svg": "app-icon/favicon.svg",
    "favicon.ico": "app-icon/favicon.ico",
    "apple-touch-icon.png": "app-icon/apple-touch-icon.png",
    "fonts/unbounded-latin.woff2": "fonts/unbounded-latin.woff2",
    "fonts/onest-latin.woff2": "fonts/onest-latin.woff2",
    "fonts/martian-mono-latin.woff2": "fonts/martian-mono-latin.woff2"
};

const entries: Entry[] = [
    { specifier: "zerolith", file: "packages/zerolith/src/index.ts", title: "zerolith" },
    { specifier: "zerolith/ssr", file: "packages/zerolith/src/ssr.ts", title: "zerolith/ssr" },
    { specifier: "zerolith/element", file: "packages/zerolith/src/element.ts", title: "zerolith/element" },
    { specifier: "zerolith/jsx-runtime", file: "packages/zerolith/src/jsx-runtime.ts", title: "zerolith/jsx-runtime" },
    { specifier: "@zerolith/router", file: "packages/router/src/index.ts", title: "@zerolith/router" },
    { specifier: "@zerolith/router/server", file: "packages/router/src/server.ts", title: "@zerolith/router/server" },
    { specifier: "@zerolith/devtools", file: "packages/devtools/src/index.ts", title: "@zerolith/devtools" },
    { specifier: "@zerolith/vite", file: "packages/vite/src/index.ts", title: "@zerolith/vite" },
    { specifier: "@zerolith/vite/runtime", file: "packages/vite/src/runtime.ts", title: "@zerolith/vite/runtime" },
    { specifier: "@zerolith/forms", file: "packages/forms/src/index.ts", title: "@zerolith/forms" },
    { specifier: "@zerolith/client", file: "packages/client/src/index.ts", title: "@zerolith/client" },
    { specifier: "@zerolith/client/generate", file: "packages/client/src/generate.ts", title: "@zerolith/client/generate" },
    { specifier: "@zerolith/client/port", file: "packages/client/src/port.ts", title: "@zerolith/client/port" },
    { specifier: "@zerolith/test", file: "packages/test/src/index.ts", title: "@zerolith/test" },
    { specifier: "@zerolith/a11y", file: "packages/a11y/src/index.ts", title: "@zerolith/a11y" },
    { specifier: "@zerolith/i18n", file: "packages/i18n/src/index.ts", title: "@zerolith/i18n" },
    { specifier: "@zerolith/i18n/compile", file: "packages/i18n/src/compile.ts", title: "@zerolith/i18n/compile" },
    { specifier: "@zerolith/otel", file: "packages/otel/src/index.ts", title: "@zerolith/otel" }
];

interface Page
{
    path: string;
    title: string;
    description: string;
    markdown: string;
    section: "Guide" | "Reference" | "Diagnostics";
    order: number;
    /** The repository path of a hand-written page's Markdown. */
    source?: string;
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
        },
        code({ text, lang })
        {
            const language = (lang ?? "").split(/\s/)[0] ?? "";
            const label = language === "" ? "" : ` data-language="${language}"`;
            const copy = `<button class="copy" type="button" aria-label="Copy code"><span class="idle">${copyIcon}</span><span class="done">${doneIcon}</span></button>`;
            return `<div class="code"${label}>${copy}<pre><code>${highlight(text, language)}</code></pre></div>\n`;
        }
    },
    hooks: {
        postprocess(html)
        {
            return html.replace(/<table>/g, "<div class=\"table\"><table>").replace(/<\/table>/g, "</table></div>");
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

/**
 * Reads one front matter value as YAML does: a double-quoted string with `\"`
 * and `\\` escapes, or a plain value. A plain value holding `: ` or ` #` is
 * refused, because YAML, and so GitHub's Markdown view, rejects or truncates it.
 */
function scalar(value: string, file: string): string
{
    if (value.startsWith("\""))
    {
        if (value.length < 2 || !value.endsWith("\"") || value.endsWith("\\\""))
        {
            throw new Error(`${file}: unterminated quoted value in front matter: ${value}`);
        }
        return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
    }
    if (value.includes(": ") || value.includes(" #"))
    {
        throw new Error(`${file}: front matter value needs double quotes: ${value}`);
    }
    return value;
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
            fields.set(line.slice(0, colon).trim(), scalar(line.slice(colon + 1).trim(), file));
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

async function guides(): Promise<Page[]>
{
    const folder = join(root, "docs", "guide");
    const names = (await readdir(folder)).filter((name) => name.endsWith(".md"));
    const pages = await Promise.all(names.map(async (name): Promise<Page> =>
    {
        const { title, description, order, body } = frontMatter(await readFile(join(folder, name), "utf8"), `docs/guide/${name}`);
        const path = name === "index.md" ? "/" : `/guide/${name.slice(0, -3)}/`;
        return { path, title, description, markdown: await includeExamples(body, `docs/guide/${name}`, root), section: "Guide", order, source: `docs/guide/${name}` };
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

/** Catalog text as Markdown: element names such as <button> are shown as code instead of read as markup. */
function catalogText(text: string): string
{
    return text.replace(/<\/?[a-z][^<>]*>/g, (tag) => "`" + tag + "`");
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
        markdown: ["# Diagnostics", "", "Every error and warning carries a stable code and a link to its page here. The code and the URL are public API; the message text is not, and production builds omit it.", "", "| Code | Cause |", "| --- | --- |", ...codes.map((code) => `| [${code}](/e/${code}/) | ${catalogText(diagnosticCatalog[code as keyof typeof diagnosticCatalog]?.cause ?? "")} |`)].join("\n"),
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
            markdown: ["# " + code, "", "## What happened", "", catalogText(text?.cause ?? ""), "", "## What to do", "", catalogText(text?.fix ?? ""), "", "The arguments of the specific occurrence are in the query string of the URL the error gave you."].join("\n"),
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
    known.add("/search.json");
    known.add("/search.js");
    known.add("/island.js");
    known.add("/theme.js");
    known.add("/zerolith/index.js");
    for (const asset of Object.keys(brandAssets))
    {
        known.add(`/${asset}`);
    }
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

interface SearchEntry
{
    path: string;
    title: string;
    section: string;
    heading: string;
    anchor: string;
    text: string;
}

/** Markdown reduced to the words a search should see: no code blocks, links, tags, or markup characters. */
function plainText(markdown: string): string
{
    return markdown
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/^@include .*$/gm, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[`*_>|#]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** One entry per page section, so a hit lands on the heading that holds the answer. */
function searchIndex(pages: Page[]): SearchEntry[]
{
    const found: SearchEntry[] = [];
    for (const page of pages)
    {
        const chunks = page.markdown.split(/^#{2,3} /m);
        for (const [index, chunk] of chunks.entries())
        {
            let heading = page.title;
            let body = chunk.replace(/^# .*$/m, "");
            if (index > 0)
            {
                const newline = chunk.indexOf("\n");
                heading = plainText(newline === -1 ? chunk : chunk.slice(0, newline));
                body = newline === -1 ? "" : chunk.slice(newline + 1);
            }
            const text = plainText(body).slice(0, 3000);
            if (text === "" && index > 0)
            {
                continue;
            }
            found.push({ path: page.path, title: page.title, section: page.section, heading, anchor: index === 0 ? "" : slug(heading), text });
        }
    }
    return found;
}

/** Copies the search island and the production build it hydrates from into the site. */
async function copyIsland(): Promise<void>
{
    const production = join(root, "packages", "zerolith", "dist", "production");
    let modules: string[];
    try
    {
        modules = (await readdir(production)).filter((name) => name.endsWith(".js"));
    }
    catch
    {
        throw new Error("packages/zerolith/dist/production is missing; run `npm run build` before `npm run docs`");
    }
    await Promise.all([mkdir(join(out, "zerolith"), { recursive: true }), mkdir(join(out, "fonts"), { recursive: true })]);
    await Promise.all([
        ...modules.map((name) => copyFile(join(production, name), join(out, "zerolith", name))),
        ...Object.entries(brandAssets).map(([path, source]) => copyFile(join(root, "brand", source), join(out, path))),
        ...["search.js", "island.js", "theme.js"].map((name) => copyFile(join(root, "scripts", "docs", name), join(out, name)))
    ]);
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
    const data: PageData = { title: page.title, description: page.description, path: page.path, content, nav, version, ...(page.source === undefined ? {} : { source: page.source }) };
    const html = renderPage(data);
    rendered.set(page.path, html);
    await Promise.all([
        write(page.path === "/" ? "index.html" : `${page.path}index.html`, rebaseHtml(html, base)),
        write(markdownTwin(page.path), rebaseMarkdown(page.markdown, base) + "\n")
    ]);
}));
checkLinks(pages, rendered);

const missing = renderPage({
    title: "Page not found",
    description: "This page does not exist.",
    path: "/404/",
    content: "<h1>Page not found</h1><p>Nothing lives at this address. Try the search, or start from the <a href=\"/\">introduction</a>.</p>",
    nav,
    version
});
await write("404.html", rebaseHtml(missing, base));

await write("styles.css", siteStyles());
await write("api.json", JSON.stringify({ generated: new Date().toISOString(), symbols: manifest }, null, 2) + "\n");
const searchEntries = searchIndex(pages);
for (const entry of searchEntries)
{
    entry.path = rebasePath(entry.path, base);
}
await write("search.json", JSON.stringify(searchEntries));
await copyIsland();

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
await write("llms.txt", rebaseMarkdown(llms.join("\n"), base));
await write("llms-full.txt", rebaseMarkdown(pages.map((page) => page.markdown).join("\n\n\n"), base) + "\n");

console.log(`docs: ${pages.length} pages, ${manifest.length} reference symbols, ${Math.round(performance.now() - start)} ms, written to site/ for ${base}`);
