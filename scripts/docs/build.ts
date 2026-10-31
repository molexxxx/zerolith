/**
 * Builds the documentation site into site/. The tutorial comes from
 * docs/learn, the guides from docs/guide, executed examples from test files
 * by region, the API reference from the sources through deno doc, and the
 * diagnostics pages from the runtime's own catalog. The home page and the
 * playground are rendered from their own modules. Every page gets a Markdown
 * twin, llms.txt indexes them, every script and module the pages load
 * carries its integrity hash, and a broken internal link or a missing
 * example fails the build.
 */
import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { rolldown } from "rolldown";
import { diagnosticCatalog } from "zerolith";
import { CORE_BUDGET_GZIP_BYTES, measure } from "../measure.ts";
import { normalizeBase, rebaseHtml, rebaseMarkdown, rebasePath } from "./base.ts";
import { exampleCode, includeExamples } from "./examples.ts";
import { highlight } from "./highlight.ts";
import { type Characteristic, Home, NotFound, homeMarkdown } from "./home.ts";
import { type Link, type NavGroup, type PageData, fontFaces, icon, markdownTwin, renderPage, siteStyles } from "./layout.ts";
import { Playground, playgroundMarkdown, playgroundModules } from "./playground.ts";
import { type Entry, type ManifestSymbol, apiReport, extract, referencePage, symbolsOf } from "./reference.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = join(root, "site");
/** Where the site is served: `ZEROLITH_DOCS_BASE`, `/` by default, `/zerolith/` on GitHub Pages. */
const base = normalizeBase(process.env["ZEROLITH_DOCS_BASE"]);
/** The site's public address, for canonical links, the social card, and the sitemap: `ZEROLITH_DOCS_URL`, or the GitHub Pages address. */
const siteUrl = (process.env["ZEROLITH_DOCS_URL"] ?? "https://molexxxx.github.io/zerolith/").replace(/\/?$/, "/");
/** The version the site describes, shown in its header. */
const version = (JSON.parse(await readFile(join(root, "packages", "zerolith", "package.json"), "utf8")) as { version: string }).version;
const copyIcon = icon("copy");
const doneIcon = icon("check");
/** Files the site serves from brand/, by their path in the site. */
const brandAssets: Record<string, string> = {
    "favicon.svg": "app-icon/favicon.svg",
    "favicon.ico": "app-icon/favicon.ico",
    "apple-touch-icon.png": "app-icon/apple-touch-icon.png",
    "social-card.png": "github/social-card.png",
    "fonts/unbounded-latin.woff2": "fonts/unbounded-latin.woff2",
    "fonts/onest-latin.woff2": "fonts/onest-latin.woff2",
    "fonts/martian-mono-latin.woff2": "fonts/martian-mono-latin.woff2"
};
/** The site's own scripts, copied from scripts/docs. */
const siteScripts = ["theme.js", "island.js", "search.js", "demo.js", "playground.js"];
/** The guides' groups, in reading order; every guide names one in its front matter. */
const guideGroups = ["Basics", "Building apps", "Tooling"];
/** The packages that ship to the browser, whose dependencies the home page counts. */
const runtimePackages = ["zerolith", "router", "forms", "client", "a11y", "i18n", "devtools", "otel", "test"];

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

type Section = "Learn" | "Guide" | "Reference" | "Diagnostics";

interface Page
{
    path: string;
    title: string;
    description: string;
    markdown: string;
    section: Section;
    /** The guide group the page sits in. */
    group?: string;
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
    group: string | undefined;
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
    return { title, description, order: Number(fields.get("order") ?? 100), group: fields.get("group"), body: source.slice(match[0].length) };
}

/** The hand-written pages of one docs folder: `index.md` at `/<folder>/`, every other file below it. */
async function collect(folder: "learn" | "guide", section: Section): Promise<Page[]>
{
    const directory = join(root, "docs", folder);
    const names = (await readdir(directory)).filter((name) => name.endsWith(".md"));
    const pages = await Promise.all(names.map(async (name): Promise<Page> =>
    {
        const file = `docs/${folder}/${name}`;
        const { title, description, order, group, body } = frontMatter(await readFile(join(directory, name), "utf8"), file);
        if (section === "Guide" && (group === undefined || !guideGroups.includes(group)))
        {
            throw new Error(`${file}: front matter needs a group, one of ${guideGroups.join(", ")}`);
        }
        const path = name === "index.md" ? `/${folder}/` : `/${folder}/${name.slice(0, -3)}/`;
        const page: Page = { path, title, description, markdown: await includeExamples(body, file, root), section, order, source: file };
        if (group !== undefined)
        {
            page.group = group;
        }
        return page;
    }));
    const groupOf = (page: Page): number => (page.group === undefined ? 0 : guideGroups.indexOf(page.group));
    return pages.toSorted((a, b) => groupOf(a) - groupOf(b) || a.order - b.order || a.title.localeCompare(b.title));
}

async function reference(): Promise<{ pages: Page[]; manifest: ManifestSymbol[]; reports: Map<string, string> }>
{
    const doc = await extract(root, entries);
    const pages: Page[] = [];
    const manifest: ManifestSymbol[] = [];
    const reports = new Map<string, string>();
    for (const [index, entry] of entries.entries())
    {
        const symbols = symbolsOf(doc, root, entry);
        manifest.push(...symbols);
        reports.set(`${slug(entry.specifier)}.api.md`, apiReport(entry, symbols));
        pages.push({
            path: `/reference/${slug(entry.specifier)}/`,
            title: entry.title,
            description: `API reference for ${entry.specifier}: ${symbols.length} exports, generated from the source.`,
            markdown: referencePage(entry, symbols),
            section: "Reference",
            order: index
        });
    }
    return { pages, manifest, reports };
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

const linkOf = (page: Page): Link => ({ title: page.title, href: page.path });

/** The sidebar of a page: the tutorial's steps, the guides by group, or the reference with the diagnostics. */
function sidebar(page: Page, pages: Page[]): { label: string; groups: NavGroup[] }
{
    const of = (section: Section): Page[] => pages.filter((candidate) => candidate.section === section);
    if (page.section === "Learn")
    {
        return { label: "Tutorial", groups: [{ title: "Tutorial", pages: of("Learn").map(linkOf), numbered: true }] };
    }
    if (page.section === "Guide")
    {
        return { label: "Guide", groups: guideGroups.map((group) => ({ title: group, pages: of("Guide").filter((candidate) => candidate.group === group).map(linkOf) })) };
    }
    const codes = of("Diagnostics");
    return {
        label: "Reference",
        groups: [
            { title: "Modules", pages: of("Reference").map(linkOf) },
            { title: "Diagnostics", pages: (page.section === "Diagnostics" ? codes : codes.slice(0, 1)).map(linkOf) }
        ]
    };
}

/** The previous and next pages in reading order: the tutorial leads into the guide, and the guide reads in group order. */
function pagerOf(page: Page, pages: Page[]): { previous?: Link; next?: Link } | undefined
{
    if (page.section === "Diagnostics")
    {
        return undefined;
    }
    const sequence = pages.filter((candidate) => candidate.section === page.section);
    const index = sequence.indexOf(page);
    const previous = sequence[index - 1];
    const following = sequence[index + 1];
    const guide = pages.find((candidate) => candidate.path === "/guide/");
    const next = following ?? (page.section === "Learn" && guide !== undefined ? guide : undefined);
    return {
        ...(previous === undefined ? {} : { previous: linkOf(previous) }),
        ...(next === undefined ? {} : { next: linkOf(next) })
    };
}

/**
 * Holds the public API to the reports checked in under api/: a build fails
 * while an export or a member was added, removed, or changed without its
 * report being updated, so every change to what users call is a reviewed
 * change. `--update-api` writes the reports instead.
 */
async function checkApi(reports: Map<string, string>): Promise<void>
{
    const folder = join(root, "api");
    if (process.argv.includes("--update-api"))
    {
        await rm(folder, { recursive: true, force: true });
        await mkdir(folder, { recursive: true });
        await Promise.all([...reports].map(([name, text]) => writeFile(join(folder, name), text)));
        console.log(`docs: wrote ${reports.size} API reports to api/`);
        return;
    }
    let present: string[] = [];
    try
    {
        present = (await readdir(folder)).filter((name) => name.endsWith(".api.md"));
    }
    catch
    {
        present = [];
    }
    const changed: string[] = [];
    for (const [name, text] of reports)
    {
        let current: string | undefined;
        try
        {
            current = await readFile(join(folder, name), "utf8");
        }
        catch
        {
            current = undefined;
        }
        if (current !== text)
        {
            changed.push(current === undefined ? `${name} (new)` : name);
        }
    }
    changed.push(...present.filter((name) => !reports.has(name)).map((name) => `${name} (removed)`));
    if (changed.length > 0)
    {
        throw new Error(`the public API differs from the reports in api/: ${changed.join(", ")}. Review the change, then run \`npm run api\` to accept it; the API of the core, templates, and router changes only through an RFC once frozen.`);
    }
}

function checkLinks(known: Set<string>, rendered: Map<string, string>): void
{
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

/** A subresource integrity value, the form both import maps and `integrity` attributes take. */
function sri(content: string | Buffer): string
{
    return `sha384-${createHash("sha384").update(content).digest("base64")}`;
}

/** A TypeScript module of the docs build compiled for the browser, so the playground highlights with the build's own code. */
async function browserModule(file: string): Promise<string>
{
    const bundle = await rolldown({ input: join(root, file) });
    const { output } = await bundle.generate({ format: "esm" });
    await bundle.close();
    const entry = output.find((item) => item.type === "chunk" && item.isEntry);
    if (entry === undefined || entry.type !== "chunk")
    {
        throw new Error(`rolldown produced no entry chunk for ${file}`);
    }
    return entry.code;
}

/** The figure's code from demo.js, highlighted, with the two bound expressions marked for the figure's readout. */
async function figureCode(): Promise<string>
{
    const path = "scripts/docs/demo.js";
    const { code } = exampleCode(await readFile(join(root, path), "utf8"), path, "figure", ["js"], "home page");
    let found = 0;
    const html = highlight(code, "js").replace(/<span class="b">\$\{<\/span>(count|doubled)<span class="b">\}/g, (_, name: string) =>
    {
        found++;
        return `<span class="b">\${</span><span data-signal="${name}">${name}</span><span class="b">}`;
    });
    if (found !== 2)
    {
        throw new Error(`${path}: the figure's template should bind count and doubled once each; found ${found} marked bindings`);
    }
    return html
        .split("\n")
        .map((line) =>
        {
            const indent = /^ */.exec(line)?.[0].length ?? 0;
            return `<span class="line" style="--indent: ${indent}ch">${line.slice(indent)}</span>`;
        })
        .join("");
}

/** The released versions and their dates, from the changelog's headings. */
async function revisions(): Promise<Array<{ version: string; date: string }>>
{
    const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
    return [...changelog.matchAll(/^## (\S+) \((\d{4}-\d{2}-\d{2})\)$/gm)].map((match) => ({ version: match[1] ?? "", date: match[2] ?? "" }));
}

/** A byte count as the characteristics table writes it. */
function bytes(count: number): string
{
    return `${count.toLocaleString("en-US")} B`;
}

/** The home page's characteristics, each computed from the build or named for the check that holds it. */
async function characteristics(manifest: ManifestSymbol[]): Promise<Characteristic[]>
{
    const core = await measure(join(root, "packages", "zerolith", "dist", "production", "index.js"));
    let dependencies = 0;
    for (const name of runtimePackages)
    {
        const manifestFile = JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
        dependencies += Object.keys(manifestFile.dependencies ?? {}).length;
    }
    return [
        { name: "Core size", value: `${bytes(core.gzip)} gzip, against a budget of ${bytes(CORE_BUDGET_GZIP_BYTES)}`, check: "`npm run size` bundles and minifies the production build and fails over budget" },
        { name: "Runtime dependencies", value: String(dependencies), check: `Counted from the manifests of the ${runtimePackages.length} runtime packages when this site was built` },
        { name: "Documented exports", value: `${manifest.length} across ${entries.length} modules`, check: "The docs build fails on an export without a doc comment" },
        { name: "Diagnostic codes", value: `${Object.keys(diagnosticCatalog).length}, each with a page`, check: "Generated from the runtime's catalog" },
        { name: "Build step", value: "Optional: an import map, or `zerolith build`", check: "The test suite runs the same files unbundled and bundled" },
        { name: "Content Security Policy", value: "`script-src 'self'` with Trusted Types and no `unsafe-eval`", check: "A browser test runs both builds under that policy" },
        { name: "Node", value: "24 or newer, for the command line and the build tools", check: "`engines` in every package" },
        { name: "License", value: "Apache-2.0", check: "Every package and the crate" }
    ];
}

/** Copies the site's scripts, the production build the islands hydrate from, the playground's modules, and the brand assets into the site. */
async function copyAssets(production: string, modules: string[]): Promise<void>
{
    await Promise.all([mkdir(join(out, "zerolith"), { recursive: true }), mkdir(join(out, "fonts"), { recursive: true })]);
    await Promise.all([
        ...modules.map((name) => copyFile(join(production, name), join(out, "zerolith", name))),
        ...Object.entries(brandAssets).map(([path, source]) => copyFile(join(root, "brand", source), join(out, path))),
        ...siteScripts.map((name) => copyFile(join(root, "scripts", "docs", name), join(out, name))),
        ...playgroundModules(root).map(({ from, to }) => cp(from, join(out, to), { recursive: true, filter: (source) => !source.endsWith(".map") && !source.endsWith(".d.ts") && !/[\\/]production$/.test(source) })),
        cp(join(root, "skills"), join(out, "skills"), { recursive: true })
    ]);
    await Promise.all([
        copyFile(join(root, "crates", "zerolith", "templates", "styles.css"), join(out, "playground", "preview.css")),
        writeFile(join(out, "playground", "fonts.css"), fontFaces("../fonts/"))
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

const learnPages = await collect("learn", "Learn");
const guidePages = await collect("guide", "Guide");
const { pages: referencePages, manifest, reports } = await reference();
await checkApi(reports);
const pages = [...learnPages, ...guidePages, ...referencePages, ...diagnostics()];
const styles = siteStyles();
const highlighter = await browserModule("scripts/docs/highlight.ts");
const integrity: Record<string, string> = { "/styles.css": sri(styles), "/highlight.js": sri(highlighter) };
for (const name of siteScripts)
{
    integrity[`/${name}`] = sri(await readFile(join(root, "scripts", "docs", name)));
}
for (const name of modules)
{
    integrity[`/zerolith/${name}`] = sri(await readFile(join(production, name)));
}
const shared = { version, integrity, image: new URL("social-card.png", siteUrl).href };
const absolute = (path: string): string => new URL(path.slice(1), siteUrl).href;
const rendered = new Map<string, string>();

async function publish(data: PageData, markdown: string): Promise<void>
{
    const html = renderPage(data);
    rendered.set(data.path, html);
    await Promise.all([
        write(data.path === "/" ? "index.html" : `${data.path}index.html`, rebaseHtml(html, base)),
        write(markdownTwin(data.path), rebaseMarkdown(markdown, base) + "\n")
    ]);
}

await Promise.all(pages.map(async (page) =>
{
    const content = await marked.parse(page.markdown);
    const pager = pagerOf(page, pages);
    await publish({
        ...shared,
        title: page.title,
        description: page.description,
        path: page.path,
        url: absolute(page.path),
        layout: "docs",
        content,
        nav: sidebar(page, pages),
        ...(pager === undefined ? {} : { pager }),
        ...(page.source === undefined ? {} : { source: page.source })
    }, page.markdown);
}));

const homeData = { version, figureCode: await figureCode(), characteristics: await characteristics(manifest), revisions: await revisions() };
const homeDescription = "A full frontend framework with clear patterns for you and your agent: signals, HTML templates with no compiler, routing, forms, server rendering, and i18n.";
await publish({ ...shared, title: "zerolith", description: homeDescription, path: "/", url: absolute("/"), layout: "wide", view: Home(homeData) }, homeMarkdown(homeData));
const playgroundDescription = "Edit a zerolith app in the browser, see it run as you type, and share a link to what you made.";
await publish({ ...shared, title: "Playground", description: playgroundDescription, path: "/playground/", url: absolute("/playground/"), layout: "wide", view: Playground() }, await playgroundMarkdown(root));

const known = new Set<string>(["/styles.css", "/highlight.js", "/llms.txt", "/llms-full.txt", "/api.json", "/search.json", "/sitemap.xml", "/zerolith/index.js"]);
for (const path of rendered.keys())
{
    known.add(path);
    known.add(markdownTwin(path));
}
for (const name of [...siteScripts, ...Object.keys(brandAssets)])
{
    known.add(`/${name}`);
}
checkLinks(known, rendered);

const missing = renderPage({
    ...shared,
    title: "Page not found",
    description: "This page does not exist.",
    path: "/404/",
    url: absolute("/404/"),
    layout: "wide",
    view: NotFound()
});
await write("404.html", rebaseHtml(missing, base));

await write("styles.css", styles);
await write("highlight.js", highlighter);
await write("api.json", JSON.stringify({ generated: new Date().toISOString(), symbols: manifest }, null, 2) + "\n");
const searchEntries = searchIndex(pages);
for (const entry of searchEntries)
{
    entry.path = rebasePath(entry.path, base);
}
await write("search.json", JSON.stringify(searchEntries));
await copyAssets(production, modules);

const sitemap = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>", "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">", ...[...rendered.keys()].toSorted().map((path) => `<url><loc>${absolute(path)}</loc></url>`), "</urlset>"];
await write("sitemap.xml", sitemap.join("\n") + "\n");

const llms = [
    "# zerolith",
    "",
    "> A full frontend framework with clear patterns for you and your agent: fine-grained signals, HTML templates that need no compiler, typed routing, forms, server rendering, i18n, and tooling that works wherever the app is served.",
    "",
    "Every page below is Markdown. The [home page](/index.md) summarizes the framework, the tutorial builds an app step by step, the guides teach one pattern per concept, the reference lists every export, and every diagnostic code has its own page.",
    ""
];
for (const section of ["Learn", "Guide", "Reference", "Diagnostics"] as const)
{
    llms.push(`## ${section === "Learn" ? "Tutorial" : section}`, "");
    for (const page of pages.filter((candidate) => candidate.section === section))
    {
        llms.push(`- [${page.title}](${markdownTwin(page.path)}): ${page.description}`);
    }
    llms.push("");
}
llms.push("## Agent Skills", "", "- [zerolith](/skills/zerolith/SKILL.md): the rules, the pattern for each concept, the commands, and a checklist for finishing a change, with every guide as a reference; install with `npx skills add molexxxx/zerolith`", "");
llms.push("## Optional", "", `- [Playground](/playground.md): ${playgroundDescription}`, "- [API manifest](/api.json): every export with its kind, module, and documentation, as JSON", "");
await write("llms.txt", rebaseMarkdown(llms.join("\n"), base));
await write("llms-full.txt", rebaseMarkdown([homeMarkdown(homeData), ...pages.map((page) => page.markdown)].join("\n\n\n"), base) + "\n");

console.log(`docs: ${rendered.size} pages, ${manifest.length} reference symbols, ${Math.round(performance.now() - start)} ms, written to site/ for ${base}`);
