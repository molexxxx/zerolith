/**
 * The documentation site's page shell, written with zerolith and rendered
 * on the server. The site is its own first consumer of server rendering,
 * and it wears the brand: the mark, the icons, the tokens, and the fonts
 * come from brand/ as they are.
 */
import { readFileSync } from "node:fs";
import { html, unsafeHtml } from "zerolith";
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

/** The brand's tokens, the font faces, and the site's own rules, as the site's one stylesheet. */
export function siteStyles(): string
{
    const faces = [
        ["Unbounded", "600", "unbounded-latin.woff2"],
        ["Onest", "400 600", "onest-latin.woff2"],
        ["Martian Mono", "400", "martian-mono-latin.woff2"]
    ].map(([family, weight, file]) => `@font-face\n{\n    font-family: "${family}";\n    font-style: normal;\n    font-weight: ${weight};\n    font-display: swap;\n    src: url("fonts/${file}") format("woff2");\n}\n`);
    const own = readFileSync(new URL("site.css", import.meta.url), "utf8");
    return `${faces.join("\n")}\n${brandFile("tokens.css")}\n\n${own}`;
}

export interface NavSection
{
    title: string;
    pages: Array<{ title: string; href: string }>;
}

export interface PageData
{
    title: string;
    description: string;
    /** Root-relative path of the page, for the active state and the Markdown twin link. */
    path: string;
    /** Rendered article HTML. */
    content: string;
    nav: NavSection[];
    /** The published version of the packages the site describes. */
    version: string;
    /** The repository path of the page's Markdown source, for guides people edit by hand. */
    source?: string;
}

const repository = "https://github.com/molexxxx/zerolith";

const sections = [
    { title: "Guide", href: "/", matches: (path: string) => path === "/" || path.startsWith("/guide/") },
    { title: "Reference", href: "/reference/zerolith/", matches: (path: string) => path.startsWith("/reference/") },
    { title: "Diagnostics", href: "/e/", matches: (path: string) => path.startsWith("/e/") }
];

/** The second-level headings of a rendered article, for the page's table of contents. */
function headings(content: string): Array<{ id: string; text: string }>
{
    return [...content.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map((match) => ({
        id: match[1] ?? "",
        text: (match[2] ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    }));
}

function Shell(page: PageData)
{
    const contents = headings(page.content);
    return html`
        <a class="skip" href="#content">Skip to content</a>
        <header class="top">
            <a class="home" href="/" aria-label="zerolith documentation home">${unsafeHtml(lockup)}</a>
            <span class="tag">${page.version}</span>
            <nav class="sections" aria-label="Sections">
                ${sections.map((section) => html`<a href=${section.href} aria-current=${section.matches(page.path) ? "true" : null}>${section.title}</a>`)}
                <a href=${repository}>GitHub</a>
            </nav>
            <button class="icon menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="sidebar">${unsafeHtml(icon("menu"))}</button>
            <button class="icon theme-toggle" type="button" aria-label="Switch between the light and dark themes"><span class="sun">${unsafeHtml(icon("sun"))}</span><span class="moon">${unsafeHtml(icon("moon"))}</span></button>
        </header>
        <div class="frame">
            <aside class="side">
                <div data-island="search">${Search()}</div>
                <nav id="sidebar" aria-label="Documentation">
                    ${page.nav.map((section) => html`
                        <h2>${section.title}</h2>
                        <ul class=${section.title.toLowerCase()}>${section.pages.map((item) => html`<li><a href=${item.href} aria-current=${item.href === page.path ? "page" : null}>${item.title}</a></li>`)}</ul>`)}
                </nav>
            </aside>
            <main id="content">
                <article>${unsafeHtml(page.content)}</article>
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

/** The `.md` path that mirrors a page path. */
export function markdownTwin(path: string): string
{
    if (path === "/")
    {
        return "/index.md";
    }
    return path.replace(/\/$/, "") + ".md";
}

/** The full HTML document for a page. */
export function renderPage(page: PageData): string
{
    const body = renderToString(Shell(page));
    const title = page.path === "/" ? "zerolith" : `${page.title} | zerolith`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(page.description)}">
<meta name="theme-color" content="#0F1114" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F5F6F8" media="(prefers-color-scheme: light)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/onest-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/unbounded-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
<link rel="alternate" type="text/markdown" href="${markdownTwin(page.path)}">
<script src="/theme.js"></script>
<noscript><style>#sidebar { display: block !important; } .menu-toggle { display: none !important; }</style></noscript>
${renderStyles()}
<script type="importmap">{"imports":{"zerolith":"/zerolith/index.js"}}</script>
<script type="module" src="/island.js"></script>
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
