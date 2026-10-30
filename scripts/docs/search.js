/**
 * The documentation site's search: a zerolith island rendered on the server
 * inside the navigation and hydrated in the browser from the production
 * build through an import map. It ranks the entries of /search.json, which
 * the docs build writes from every section of every page.
 */
import { computed, css, each, html, resource, signal, when } from "zerolith";

/**
 * @typedef {object} Entry
 * @property {string} path
 * @property {string} title
 * @property {string} section
 * @property {string} heading
 * @property {string} anchor
 * @property {string} text
 */

/**
 * @typedef {object} Hit
 * @property {Entry} entry
 * @property {number} score
 * @property {string} snippet
 */

const styles = css`
    :scope { position: relative; }
    input { width: 100%; height: 48px; margin: 0; padding: 0 var(--zl-space-4); border: var(--zl-rule) solid var(--zl-control-line); border-radius: 0; background: var(--zl-bg); color: var(--zl-text); font-family: var(--zl-font-mono); font-size: 0.875rem; appearance: none; }
    input::placeholder { color: var(--zl-text-muted); opacity: 1; }
    input::-webkit-search-cancel-button { display: none; }
    input:focus { outline: none; border-color: var(--zl-focus); box-shadow: inset 0 0 0 1px var(--zl-focus); }
    ul { position: absolute; top: calc(100% + var(--zl-space-2)); left: 0; z-index: 20; width: min(480px, calc(100vw - 2 * var(--zl-space-4))); max-height: 60vh; margin: 0; padding: 0; overflow: auto; list-style: none; background: var(--zl-bg); border: var(--zl-rule) solid var(--zl-line); }
    li + li { border-top: var(--zl-rule) solid var(--zl-line); }
    li a { display: block; padding: var(--zl-space-3) var(--zl-space-4); color: var(--zl-text); text-decoration: none; }
    li a:hover, li a:focus-visible { background: var(--zl-surface); outline-offset: calc(-1 * var(--zl-rule)); }
    .where { display: block; margin-top: var(--zl-space-1); color: var(--zl-text-muted); font-family: var(--zl-font-mono); font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; }
    .snippet { display: block; margin-top: var(--zl-space-1); color: var(--zl-text-muted); font-size: 0.8125rem; }
`;

/**
 * Splits a query into lowercase search terms.
 * @param {string} query
 * @returns {string[]}
 */
export function terms(query)
{
    return query.toLowerCase().split(/[^a-z0-9_$.@/-]+/).filter((term) => term.length > 0);
}

/**
 * @param {string} text
 * @param {string} term
 * @returns {number}
 */
function count(text, term)
{
    let total = 0;
    for (let index = text.indexOf(term); index !== -1; index = text.indexOf(term, index + term.length))
    {
        total++;
    }
    return total;
}

/**
 * A window of the text around the first term it contains.
 * @param {string} text
 * @param {readonly string[]} words
 * @returns {string}
 */
function snippet(text, words)
{
    const lower = text.toLowerCase();
    let first = -1;
    for (const word of words)
    {
        const index = lower.indexOf(word);
        if (index !== -1 && (first === -1 || index < first))
        {
            first = index;
        }
    }
    if (first === -1)
    {
        return text.slice(0, 140);
    }
    const start = Math.max(0, first - 50);
    const end = Math.min(text.length, start + 140);
    return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

/**
 * Ranks entries for a query. Every term must appear in the entry; a term in
 * the page title weighs more than one in the section heading, which weighs
 * more than one in the text.
 * @param {readonly Entry[]} entries
 * @param {string} query
 * @returns {Hit[]}
 */
export function rank(entries, query)
{
    const words = terms(query);
    if (words.length === 0)
    {
        return [];
    }
    /** @type {Hit[]} */
    const hits = [];
    for (const entry of entries)
    {
        const title = entry.title.toLowerCase();
        const heading = entry.heading.toLowerCase();
        const text = entry.text.toLowerCase();
        let score = 0;
        for (const word of words)
        {
            const inTitle = count(title, word);
            const inHeading = count(heading, word);
            const inText = Math.min(count(text, word), 5);
            if (inTitle + inHeading + inText === 0)
            {
                score = 0;
                break;
            }
            score += inTitle * 10 + inHeading * 5 + inText + (title === word ? 20 : 0);
        }
        if (score > 0)
        {
            hits.push({ entry, score, snippet: snippet(entry.text, words) });
        }
    }
    return hits.toSorted((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
}

/**
 * @param {Entry} entry
 * @returns {string}
 */
function href(entry)
{
    return entry.anchor === "" ? entry.path : `${entry.path}#${entry.anchor}`;
}

/** The search box and its results. */
export function Search()
{
    const query = signal("");
    const index = resource({
        params: () => (terms(query.get()).length > 0 ? new URL("search.json", import.meta.url).href : undefined),
        loader: async ({ params, abort }) => /** @type {Entry[]} */ (await (await fetch(params, { signal: abort })).json())
    });
    const hits = computed(() => rank(index.get() ?? [], query.get()).slice(0, 8));
    const open = computed(() => hits.get().length > 0);
    /** @param {Event} event */
    const onInput = (event) =>
    {
        query.set(/** @type {HTMLInputElement} */ (event.currentTarget).value);
    };
    /** @param {KeyboardEvent} event */
    const onKeydown = (event) =>
    {
        if (event.key === "Escape")
        {
            query.set("");
        }
        else if (event.key === "Enter")
        {
            const first = hits.get()[0];
            if (first !== undefined)
            {
                location.assign(href(first.entry));
            }
        }
    };
    return html`
        <div class=${styles} role="search">
            <input type="search" placeholder="Search the docs" aria-label="Search the documentation" autocomplete="off" .value=${query} @input=${onInput} @keydown=${onKeydown}>
            ${when(open, () => html`<ul>${each(hits, (hit) => `${hit.entry.path}#${hit.entry.anchor}`, (hit) => html`
                <li><a href=${computed(() => href(hit.get().entry))}>
                    ${computed(() => hit.get().entry.heading)}
                    <span class="where">${computed(() => `${hit.get().entry.section} / ${hit.get().entry.title}`)}</span>
                    <span class="snippet">${computed(() => hit.get().snippet)}</span>
                </a></li>`)}</ul>`)}
        </div>`;
}
