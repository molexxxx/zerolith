/**
 * The playground page: an editor beside a live preview. The page is rendered
 * on the server with the first example in place, and playground.js runs it
 * in a sandboxed frame that loads the development builds of the packages
 * through its own import map, so diagnostics arrive with their full text.
 * Every example is a file under playground/ that the site test runs here.
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type View, html, unsafeHtml } from "zerolith";
import { highlight } from "./highlight.ts";
import { icon } from "./layout.ts";

export interface Example
{
    id: string;
    title: string;
    summary: string;
}

/** The examples, in the order the picker lists them; each is `playground/<id>.js`. */
export const examples: Example[] = [
    { id: "counter", title: "Counter", summary: "A signal, a derived value, and an event handler." },
    { id: "list", title: "Packing list", summary: "A keyed list with `each`, a form, and counts derived from the list." },
    { id: "conditions", title: "Conditions", summary: "Showing and hiding parts of a view with `when`." },
    { id: "async", title: "Async data", summary: "A `resource` with loading, error, and reload." },
    { id: "styles", title: "Scoped styles", summary: "Component styles with the `css` tag." },
    { id: "dialog", title: "Accessible dialog", summary: "A native dialog with a focus trap and an announcement from `@zerolith/a11y`." },
    { id: "formats", title: "Formatting", summary: "Numbers, dates, and lists that follow a locale signal with `@zerolith/i18n`." }
];

/** The packages the preview frame can import, by specifier, with the folder and module each resolves to. */
export const packages: ReadonlyArray<{ specifier: string; folder: string; module: string }> = [
    { specifier: "zerolith", folder: "zerolith", module: "index.js" },
    { specifier: "zerolith/element", folder: "zerolith", module: "element.js" },
    { specifier: "@zerolith/router", folder: "router", module: "index.js" },
    { specifier: "@zerolith/forms", folder: "forms", module: "index.js" },
    { specifier: "@zerolith/a11y", folder: "a11y", module: "index.js" },
    { specifier: "@zerolith/i18n", folder: "i18n", module: "index.js" }
];

/** The built package folders the site copies for the preview frame, from and to. */
export function playgroundModules(root: string): Array<{ from: string; to: string }>
{
    return [...new Set(packages.map((entry) => entry.folder))].map((folder) => ({ from: join(root, "packages", folder, "dist"), to: join("playground", "modules", folder) }));
}

function source(id: string): string
{
    return readFileSync(new URL(`playground/${id}.js`, import.meta.url), "utf8").trim();
}

/** The playground page's main content, with the first example in the editor. */
export function Playground(): View
{
    const first = examples[0];
    const code = first === undefined ? "" : source(first.id);
    const sources = Object.fromEntries(examples.map((example) => [example.id, source(example.id)]));
    const imports = Object.fromEntries(packages.map((entry) => [entry.specifier, `modules/${entry.folder}/${entry.module}`]));
    const editor = `<textarea name="code" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code" aria-describedby="editor-hint">${escapeText(code)}</textarea>`;
    return html`
        <div class="playground" data-playground data-examples=${JSON.stringify(sources)} data-imports=${JSON.stringify(imports)}>
            <div class="bar">
                <label class="field">
                    <span>Example</span>
                    <select name="example">${examples.map((example) => html`<option value=${example.id}>${example.title}</option>`)}</select>
                </label>
                <button class="button primary" type="button" data-action="run">${unsafeHtml(icon("arrow-right"))}Run</button>
                <button class="button" type="button" data-action="share"><span class="idle">${unsafeHtml(icon("link"))}Copy link</span><span class="done">${unsafeHtml(icon("check"))}Link copied</span></button>
                <button class="button" type="button" data-action="reset">Reset</button>
                <p class="hint" id="editor-hint">Runs as you type. Tab indents; press Escape, then Tab, to leave the editor.</p>
            </div>
            <div class="panes">
                <div class="editor">
                    <pre aria-hidden="true"><code>${unsafeHtml(highlight(code, "js"))}</code></pre>
                    ${unsafeHtml(editor)}
                </div>
                <div class="preview">
                    <iframe title="Preview" sandbox="allow-scripts allow-modals"></iframe>
                    <div class="console" role="log" aria-label="Console"></div>
                </div>
            </div>
            <p class="noscript">The playground runs your code in the browser, so it needs JavaScript. Every example is also in the <a href="/playground.md">Markdown version of this page</a>.</p>
        </div>`;
}

/** Text escaped for the content of a raw-text element such as `<textarea>`. */
function escapeText(text: string): string
{
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/** The playground as Markdown: what it does and every example's code. */
export async function playgroundMarkdown(root: string): Promise<string>
{
    const parts = ["# Playground", "", "Edit a zerolith app in the browser and see it run as you type. The code runs in a sandboxed frame with the development builds of `zerolith`, `@zerolith/router`, `@zerolith/forms`, `@zerolith/a11y`, and `@zerolith/i18n`, so diagnostics carry their full text. A view renders into `<main id=\"app\">`, and `console` output shows under the preview. Copy link puts the code in the address, so a link opens with your code in the editor.", "", "## Examples"];
    for (const example of examples)
    {
        const code = (await readFile(join(root, "scripts", "docs", "playground", `${example.id}.js`), "utf8")).trim();
        parts.push("", `### ${example.title}`, "", example.summary, "", "```js", code, "```");
    }
    return parts.join("\n");
}
