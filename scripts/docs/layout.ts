/**
 * The documentation site's page shell, written with zerolith and rendered
 * on the server. The site is its own first consumer of server rendering.
 */
import { css, html, unsafeHtml } from "zerolith";
import { renderStyles, renderToString } from "zerolith/ssr";

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
}

const shell = css`
    :scope { display: grid; grid-template-columns: 16rem minmax(0, 1fr); min-height: 100vh; }
    nav { border-right: 1px solid var(--line); padding: 24px 16px; position: sticky; top: 0; height: 100vh; overflow: auto; }
    nav h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 20px 0 8px; }
    nav ul { list-style: none; margin: 0; padding: 0; }
    nav li a { display: block; padding: 4px 8px; border-radius: 6px; text-decoration: none; color: var(--text); }
    nav li a[aria-current="page"] { background: var(--panel); color: var(--accent); }
    nav .brand { font-weight: 700; font-size: 1.1rem; text-decoration: none; color: var(--text); }
    main { padding: 32px 48px; max-width: 52rem; }
    main .md { font-size: 0.85rem; color: var(--muted); }
    @media (max-width: 760px) {
        :scope { grid-template-columns: 1fr; }
        nav { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
        main { padding: 24px 16px; }
    }
`;

function Shell(page: PageData)
{
    return html`
        <div class=${shell}>
            <nav aria-label="Documentation">
                <a class="brand" href="/">zerolith</a>
                ${page.nav.map((section) => html`
                    <h2>${section.title}</h2>
                    <ul>${section.pages.map((item) => html`<li><a href=${item.href} aria-current=${item.href === page.path ? "page" : null}>${item.title}</a></li>`)}</ul>`)}
            </nav>
            <main>
                ${unsafeHtml(page.content)}
                <p class="md">This page as Markdown: <a href=${markdownTwin(page.path)}>${markdownTwin(page.path)}</a></p>
            </main>
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
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)}</title>
<meta name="description" content="${escape(page.description)}">
<link rel="stylesheet" href="/styles.css">
<link rel="alternate" type="text/markdown" href="${markdownTwin(page.path)}">
${renderStyles()}
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

/** The global stylesheet: tokens and typography; component styles come from css literals. */
export const globalStyles: string = `:root {
    --bg: #101214;
    --panel: #181b1f;
    --line: #2a2f36;
    --text: #e6e8eb;
    --muted: #9aa3ad;
    --accent: #7cc4ff;
    color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.6 system-ui, sans-serif; background: var(--bg); color: var(--text); }
a { color: var(--accent); }
h1 { font-size: 2rem; margin: 0 0 16px; }
h2 { font-size: 1.4rem; margin: 40px 0 12px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
h3 { font-size: 1.1rem; margin: 28px 0 8px; }
code { font: 0.9em ui-monospace, monospace; background: var(--panel); padding: 1px 5px; border-radius: 4px; }
pre { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; overflow: auto; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
blockquote { margin: 16px 0; padding: 8px 16px; border-left: 3px solid var(--accent); background: var(--panel); }
`;
