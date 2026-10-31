/**
 * The docs site's home page, set as the framework's datasheet: the headline
 * and the create command, a running figure that measures its own DOM
 * updates, the packages, characteristics the docs build computes, the ways
 * in, and the revision history from the changelog. The Markdown twin says
 * the same for agents.
 */
import { type View, html, unsafeHtml } from "zerolith";
import { Figure } from "./demo.js";
import { highlight } from "./highlight.ts";
import { glyph, icon, repository } from "./layout.ts";

export interface Characteristic
{
    name: string;
    value: string;
    check: string;
}

export interface HomeData
{
    version: string;
    /** The figure's code as highlighted HTML, its bound expressions marked with `data-signal`. */
    figureCode: string;
    characteristics: Characteristic[];
    revisions: Array<{ version: string; date: string }>;
}

export const createCommand = "npx @zerolith/cli@alpha new my-app";
const startCode = `${createCommand}\ncd my-app\nnpm run dev`;

/** Text with `code` spans, as the characteristics table writes it. */
function inline(text: string)
{
    return text.split("`").map((part, index) => (index % 2 === 1 ? html`<code>${part}</code>` : part));
}

const features = [
    { href: "/guide/signals/", name: "Fine-grained signals", text: "an update reaches only its bindings." },
    { href: "/guide/templates/", name: "HTML templates", text: "they run in the browser with no compiler." },
    { href: "/guide/routing/", name: "A typed router", text: "loaders, head tags, and plain anchors." },
    { href: "/guide/forms/", name: "Native forms", text: "fetch, pending state, and field errors." },
    { href: "/guide/server-rendering/", name: "Server rendering and hydration", text: "on Request and Response." },
    { href: "/e/", name: "Coded diagnostics", text: "every error names its cause and fix." },
    { href: "/guide/command-line/", name: "One command line", text: "start, develop, bundle, and preview." },
    { href: "/guide/agents/", name: "Context for agents", text: "AGENTS.md, Skills, and Markdown twins." }
];

interface Part
{
    name: string;
    href: string;
    mark: string;
    text: string;
}

const libraries: Part[] = [
    { name: "@zerolith/router", href: "/guide/routing/", mark: glyph("router"), text: "Route table, loaders, head tags" },
    { name: "@zerolith/forms", href: "/guide/forms/", mark: glyph("forms"), text: "Fetch, pending state, field errors" },
    { name: "@zerolith/client", href: "/guide/client/", mark: glyph("client"), text: "Typed calls from OpenAPI" },
    { name: "@zerolith/i18n", href: "/guide/i18n/", mark: glyph("i18n"), text: "Locales and compiled messages" },
    { name: "@zerolith/a11y", href: "/guide/accessibility/", mark: glyph("a11y"), text: "Focus, announcer, preferences" },
    { name: "@zerolith/otel", href: "/guide/observability/", mark: glyph("otel"), text: "Spans for navigation and requests" }
];

const core: Part = { name: "zerolith", href: "/guide/", mark: "", text: "Signals, html and css templates, rendering, hydration, server rendering, custom elements, and coded diagnostics" };

const tools: Part[] = [
    { name: "@zerolith/cli", href: "/guide/command-line/", mark: icon("terminal"), text: "new, dev, build, preview, doctor" },
    { name: "@zerolith/vite", href: "/guide/vite/", mark: glyph("vite"), text: "The build passes and hot replacement" },
    { name: "@zerolith/test", href: "/guide/testing/", mark: glyph("test"), text: "Mount, settle, hydration checks" },
    { name: "@zerolith/devtools", href: "/guide/dev-tools/", mark: glyph("devtools"), text: "Inspector and Performance tracks" }
];

const ways = [
    { href: "/learn/", name: "Tutorial", text: "Build a packing list from an empty folder to a deployed app, one idea per step." },
    { href: "/guide/", name: "Guide", text: "Every concept with its one pattern and an example that runs as a test." },
    { href: "/playground/", name: "Playground", text: "Edit zerolith in the browser, see it run, and share a link to what you made." },
    { href: "/reference/zerolith/", name: "Reference", text: "Every export of every package, generated from the source." },
    { href: "/guide/agents/", name: "For coding agents", text: "What your agent reads: AGENTS.md, Skills, llms.txt, and the Markdown twins." }
];

/** One cell of the block diagram; the core's cell carries no glyph, since the header already shows the mark. */
function PartCell(part: Part, kind: "library" | "core" | "tool")
{
    return html`
        <a class=${kind === "library" ? "part" : `part ${kind}`} href=${part.href}>
            ${part.mark === "" ? null : html`<span class="mark">${unsafeHtml(part.mark)}</span>`}
            <span class="name">${part.name}</span>
            <span class="text">${part.text}</span>
        </a>`;
}

/** The home page's main content. */
export function Home(data: HomeData): View
{
    return html`
        <section class="masthead">
            <div class="title">
                <h1><span>Full framework.</span> <span>Zero guesswork.</span></h1>
                <p class="lead">Routing, forms, rendering, and i18n, with clear patterns for you and your agent.</p>
                <div class="command">
                    <code>${createCommand.split(" ").map((word, index) => html`${index === 0 ? "" : " "}<span>${word}</span>`)}</code>
                    <button class="copy button primary" type="button" data-copy=${createCommand} aria-label="Copy the command"><span class="idle">${unsafeHtml(icon("copy"))}Copy</span><span class="done">${unsafeHtml(icon("check"))}Copied</span></button>
                </div>
                <p class="ways-in"><a href="/learn/">Start the tutorial</a><a href="/playground/">Open the playground</a><a href="/guide/">Read the guide</a></p>
            </div>
            <div class="features">
                <h2>Features</h2>
                <ul>${features.map((feature) => html`<li><a href=${feature.href}>${feature.name}</a>: ${feature.text}</li>`)}</ul>
            </div>
        </section>
        <figure class="figure">
            <div class="code" data-language="js"><pre><code>${unsafeHtml(data.figureCode)}</code></pre></div>
            <div class="run" data-island="figure">${Figure()}</div>
            <figcaption>Figure 1. This counter is running on this page: rendered by the docs build, hydrated in your browser, and measured with a MutationObserver. Press Add one: two text nodes change, and Counter() never runs again.</figcaption>
        </figure>
        <section class="band">
            <h2>Everything an application needs</h2>
            <p>One core and the packages around it. Each package is optional, has its own guide, and shares the core's signals, so nothing needs an adapter.</p>
            <figure class="diagram">
                <div class="cells">
                    ${libraries.map((part) => PartCell(part, "library"))}
                    ${PartCell(core, "core")}
                    ${tools.map((part) => PartCell(part, "tool"))}
                </div>
                <figcaption>Figure 2. The libraries an application imports, above the core they share, and the tools that build, test, and inspect it.</figcaption>
            </figure>
        </section>
        <section class="band">
            <h2>Characteristics</h2>
            <p>Each value is computed when this site is built or checked by the test suite, so it describes the version in the header.</p>
            <div class="table">
                <table>
                    <thead><tr><th scope="col">Characteristic</th><th scope="col">Value</th><th scope="col">How it is checked</th></tr></thead>
                    <tbody>${data.characteristics.map((row) => html`<tr><th scope="row">${row.name}</th><td data-label="Value">${inline(row.value)}</td><td data-label="How it is checked">${inline(row.check)}</td></tr>`)}</tbody>
                </table>
            </div>
        </section>
        <section class="band start">
            <h2>Start a project</h2>
            <div class="columns">
                <div>
                    <p>Node 24 or newer is required. The command writes a starter that asks for the language, the build tool, and the inspector; <code>--yes</code> takes every default.</p>
                    <p>To add zerolith to a project you have, install <code>zerolith@alpha</code> and the packages you need. To serve with no build step at all, <a href="/guide/command-line/#importmap"><code>zerolith importmap</code></a> writes an import map with integrity hashes.</p>
                </div>
                <div class="code" data-language="sh"><button class="copy" type="button" aria-label="Copy code"><span class="idle">${unsafeHtml(icon("copy"))}</span><span class="done">${unsafeHtml(icon("check"))}</span></button><pre><code>${unsafeHtml(highlight(startCode, "sh"))}</code></pre></div>
            </div>
        </section>
        <section class="band">
            <h2>Learn zerolith</h2>
            <ul class="index">${ways.map((way) => html`<li><a href=${way.href}><span class="name">${way.name}</span><span class="text">${way.text}</span>${unsafeHtml(icon("arrow-right"))}</a></li>`)}</ul>
        </section>
        <section class="band">
            <h2>Revision history</h2>
            <p>zerolith is in alpha: the API may change until it is frozen for 1.0, and the <a href=${`${repository}/blob/main/docs/ROADMAP.md`}>roadmap</a> lists what remains.</p>
            <div class="table">
                <table>
                    <thead><tr><th scope="col">Version</th><th scope="col">Date</th><th scope="col">Notes</th></tr></thead>
                    <tbody>${data.revisions.map((revision) => html`<tr><th scope="row">${revision.version}</th><td data-label="Date">${revision.date}</td><td data-label="Notes"><a href=${`${repository}/releases/tag/zerolith%40${revision.version}`} aria-label=${`Release notes for ${revision.version}`}>Release notes</a></td></tr>`)}</tbody>
                </table>
            </div>
        </section>
        <footer class="site-foot">
            <nav aria-label="Site">
                <a href="/learn/">Tutorial</a>
                <a href="/guide/">Guide</a>
                <a href="/reference/zerolith/">Reference</a>
                <a href="/e/">Diagnostics</a>
                <a href="/playground/">Playground</a>
                <a href=${repository}>GitHub</a>
                <a href="https://www.npmjs.com/package/zerolith">npm</a>
                <a href=${`${repository}/blob/main/CHANGELOG.md`}>Changelog</a>
            </nav>
            <p>zerolith ${data.version}, Apache-2.0. <a href="/index.md">This page as Markdown</a></p>
        </footer>`;
}

/** The page a missing address shows. */
export function NotFound(): View
{
    return html`
        <section class="masthead missing">
            <div class="title">
                <h1>Page not found</h1>
                <p class="lead">Nothing lives at this address. One of these will get you back on track.</p>
                <p class="ways-in"><a href="/">Home</a><a href="/learn/">Tutorial</a><a href="/guide/">Guide</a><a href="/reference/zerolith/">Reference</a></p>
            </div>
        </section>`;
}

/** The home page as Markdown, for agents and the llms indexes. */
export function homeMarkdown(data: HomeData): string
{
    return [
        "# zerolith",
        "",
        "Full framework. Zero guesswork. Routing, forms, rendering, and i18n, with clear patterns for you and your agent.",
        "",
        "## Start",
        "",
        "```sh",
        startCode,
        "```",
        "",
        "## Features",
        "",
        ...features.map((feature) => `- [${feature.name}](${feature.href}): ${feature.text}`),
        "",
        "## Packages",
        "",
        ...[core, ...libraries, ...tools].map((part) => `- [${part.name}](${part.href}): ${part.text}`),
        "",
        "## Characteristics",
        "",
        "| Characteristic | Value | How it is checked |",
        "| --- | --- | --- |",
        ...data.characteristics.map((row) => `| ${row.name} | ${row.value} | ${row.check} |`),
        "",
        "## Learn",
        "",
        ...ways.map((way) => `- [${way.name}](${way.href}): ${way.text}`),
        "",
        "## Revisions",
        "",
        ...data.revisions.map((revision) => `- ${revision.version}, ${revision.date}`)
    ].join("\n");
}
