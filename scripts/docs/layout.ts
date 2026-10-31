/**
 * The documentation site's page shells, written with zerolith and rendered
 * on the server: the docs shell for the tutorial, the guides, the reference,
 * and the diagnostics, and a full-width shell for the home page and the
 * playground. The site is its own first consumer of server rendering, and
 * it wears the brand: the mark, the icons, the tokens, and the fonts come
 * from brand/ as they are.
 */
import { readFileSync } from "node:fs";
import { type View, html, unsafeHtml } from "zerolith";
import { renderStyles, renderToString } from "zerolith/ssr";
import { Search } from "./search.js";

const brand = new URL("../../brand/", import.meta.url);

function brandFile(path: string): string
{
    return readFileSync(new URL(path, brand), "utf8").trim();
}

/** An interface icon from the brand set, inline so it takes the color of the text around it. */
export function icon(name: string): string
{
    return brandFile(`icons/ui/${name}.svg`);
}

/** A package glyph from the brand set, inline like the interface icons. */
export function glyph(name: string): string
{
    return brandFile(`icons/packages/${name}.svg`);
}

/** Replaces one fragment of a brand file, failing the build if the file no longer has it. */
function replaceOnce(text: string, from: string, to: string): string
{
    if (!text.includes(from))
    {
        throw new Error(`brand/lockup/horizontal-on-dark.svg no longer contains ${from}; update the docs shell`);
    }
    return text.replace(from, to);
}

/** The horizontal lockup, with the stele and the word colored by the stylesheet for either theme. */
const lockup = [
    [" role=\"img\" aria-label=\"zerolith\"><title>zerolith</title>", " aria-hidden=\"true\" focusable=\"false\">"],
    ["fill=\"#AACF16\"", "class=\"stele\""],
    ["fill=\"#E8EAED\"", "fill=\"currentColor\""]
].reduce((svg, [from, to]) => replaceOnce(svg, from ?? "", to ?? ""), brandFile("lockup/horizontal-on-dark.svg"));

/** The brand's three faces, with their files under `folder` relative to the stylesheet that holds the rules. */
export function fontFaces(folder: string): string
{
    return [
        ["Unbounded", "600", "unbounded-latin.woff2"],
        ["Onest", "400 600", "onest-latin.woff2"],
        ["Martian Mono", "400", "martian-mono-latin.woff2"]
    ].map(([family, weight, file]) => `@font-face\n{\n    font-family: "${family}";\n    font-style: normal;\n    font-weight: ${weight};\n    font-display: swap;\n    src: url("${folder}${file}") format("woff2");\n}\n`).join("\n");
}

/** The brand's tokens, the font faces, and the site's own rules, as the site's one stylesheet. */
export function siteStyles(): string
{
    const own = readFileSync(new URL("site.css", import.meta.url), "utf8");
    return `${fontFaces("fonts/")}\n${brandFile("tokens.css")}\n\n${own}`;
}

/** A link in the sidebar or the pager. */
export interface Link
{
    title: string;
    href: string;
}

/** A titled group of sidebar links; the tutorial's steps are numbered. */
export interface NavGroup
{
    title: string;
    pages: Link[];
    numbered?: boolean;
}

export interface PageData
{
    title: string;
    description: string;
    /** Root-relative path of the page, for the active state and the Markdown twin link. */
    path: string;
    /** The page's absolute address, for the canonical link and the social card. */
    url: string;
    /** The absolute address of the social card image. */
    image: string;
    /** `docs` for a page with the sidebar, `wide` for the home page and the playground. */
    layout: "docs" | "wide";
    /** Rendered article HTML of a docs page. */
    content?: string;
    /** The main content of a wide page. */
    view?: View;
    /** The sidebar of a docs page, named for its section. */
    nav?: { label: string; groups: NavGroup[] };
    pager?: { previous?: Link; next?: Link };
    /** The published version of the packages the site describes. */
    version: string;
    /** The repository path of the page's Markdown source, for pages people edit by hand. */
    source?: string;
    /** Subresource integrity of every script, module, and stylesheet the page loads, by root-relative path. */
    integrity: Readonly<Record<string, string>>;
}

export const repository = "https://github.com/molexxxx/zerolith";

const sections = [
    { title: "Learn", href: "/learn/", matches: (path: string) => path.startsWith("/learn/") },
    { title: "Guide", href: "/guide/", matches: (path: string) => path.startsWith("/guide/") },
    { title: "Reference", href: "/reference/zerolith/", matches: (path: string) => path.startsWith("/reference/") || path.startsWith("/e/") },
    { title: "Playground", href: "/playground/", matches: (path: string) => path.startsWith("/playground/") }
];

/** The second-level headings of a rendered article, for the page's table of contents. */
function headings(content: string): Array<{ id: string; text: string }>
{
    return [...content.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map((match) => ({
        id: match[1] ?? "",
        text: (match[2] ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    }));
}

function Header(page: PageData)
{
    return html`
        <a class="skip" href="#content">Skip to content</a>
        <header class="top">
            <a class="home" href="/" aria-label="zerolith home">${unsafeHtml(lockup)}</a>
            <span class="tag">${page.version}</span>
            <nav class="sections" id="sections" aria-label="Sections">
                ${sections.map((section) => html`<a href=${section.href} aria-current=${section.matches(page.path) ? "true" : null}>${section.title}</a>`)}
                <a href=${repository}>GitHub</a>
            </nav>
            <button class="icon menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls=${page.nav === undefined ? "sections" : "sections sidebar"}>${unsafeHtml(icon("menu"))}</button>
            <button class="icon theme-toggle" type="button" aria-label="Switch between the light and dark themes"><span class="sun">${unsafeHtml(icon("sun"))}</span><span class="moon">${unsafeHtml(icon("moon"))}</span></button>
        </header>`;
}

function Pager({ previous, next }: { previous?: Link; next?: Link })
{
    return html`
        <nav class="pager" aria-label="Previous and next pages">
            ${previous === undefined ? null : html`<a class="previous" href=${previous.href} rel="prev"><span class="label">Previous</span><span class="title">${previous.title}</span></a>`}
            ${next === undefined ? null : html`<a class="next" href=${next.href} rel="next"><span class="label">Next</span><span class="title">${next.title}</span></a>`}
        </nav>`;
}

function Docs(page: PageData)
{
    const content = page.content ?? "";
    const contents = headings(content);
    return html`
        ${Header(page)}
        <div class="frame">
            <aside class="side">
                <div data-island="search">${Search()}</div>
                ${page.nav === undefined ? null : html`
                    <nav id="sidebar" aria-label=${page.nav.label}>
                        ${page.nav.groups.map((group) => html`
                            <h2>${group.title}</h2>
                            <ul class=${group.numbered === true ? "numbered" : null}>${group.pages.map((item) => html`<li><a href=${item.href} aria-current=${item.href === page.path ? "page" : null}>${item.title}</a></li>`)}</ul>`)}
                    </nav>`}
            </aside>
            <main id="content">
                <article>${unsafeHtml(content)}</article>
                ${page.pager === undefined ? null : Pager(page.pager)}
                <footer class="page-foot">
                    <a href=${markdownTwin(page.path)}>This page as Markdown</a>
                    ${page.source === undefined ? null : html`<a href=${`${repository}/edit/main/${page.source}`}>Edit this page</a>`}
                </footer>
            </main>
            ${contents.length < 2 ? null : html`
                <nav class="toc" aria-label="On this page">
                    <h2>On this page</h2>
                    <ul>${contents.map((heading) => html`<li><a href=${`#${heading.id}`}>${heading.text}</a></li>`)}</ul>
                </nav>`}
        </div>`;
}

function Wide(page: PageData)
{
    return html`
        ${Header(page)}
        <main id="content" class="wide">${page.view ?? null}</main>`;
}

/** The `.md` path that mirrors a page path. */
export function markdownTwin(path: string): string
{
    if (path === "/")
    {
        return "/index.md";
    }
    return path.replace(/\/$/, "") + ".md";
}

/** The `integrity` attribute for a file the page loads, when the build hashed it. */
function integrityOf(page: PageData, path: string): string
{
    const hash = page.integrity[path];
    return hash === undefined ? "" : ` integrity="${hash}"`;
}

/** The import map: `zerolith` resolves to the production build, and every module the page can load carries its hash. */
function importMap(page: PageData): string
{
    const integrity = Object.fromEntries(Object.entries(page.integrity).filter(([path]) => path.endsWith(".js") && path !== "/theme.js"));
    return JSON.stringify({ imports: { zerolith: "/zerolith/index.js" }, integrity });
}

/** The full HTML document for a page. */
export function renderPage(page: PageData): string
{
    const body = renderToString(page.layout === "docs" ? Docs(page) : Wide(page));
    const title = page.path === "/" ? "zerolith: Full framework. Zero guesswork." : `${page.title} | zerolith`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(page.description)}">
<link rel="canonical" href="${page.url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="zerolith">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(page.description)}">
<meta property="og:url" content="${page.url}">
<meta property="og:image" content="${page.image}">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta property="og:image:alt" content="The zerolith stele and wordmark with the line Full framework. Zero guesswork.">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0F1114" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F5F6F8" media="(prefers-color-scheme: light)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/onest-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/unbounded-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css"${integrityOf(page, "/styles.css")}>
<link rel="alternate" type="text/markdown" href="${markdownTwin(page.path)}">
<script src="/theme.js"${integrityOf(page, "/theme.js")}></script>
<noscript><style>@media (max-width: 960px) { .top { flex-wrap: wrap; height: auto; padding-block: 12px; } .sections { display: flex !important; flex-basis: 100%; flex-wrap: wrap; order: 1; } #sidebar { display: block !important; } .menu-toggle { display: none !important; } }</style></noscript>
${renderStyles()}
<script type="importmap">${importMap(page)}</script>
<script type="module" src="/island.js"${integrityOf(page, "/island.js")}></script>
</head>
<body>
${body}
</body>
</html>
`;
}

function escape(text: string): string
{
    return text.replace(/[&<>"]/g, (character) => (character === "&" ? "&amp;" : character === "<" ? "&lt;" : character === ">" ? "&gt;" : "&quot;"));
}
