/**
 * The documentation site's search: a zerolith island rendered on the server
 * inside the navigation and hydrated in the browser from the production
 * build through an import map. Its button, Ctrl+K, and / open a dialog that
 * ranks the entries of search.json, which the docs build writes from every
 * section of every page, groups them by section, marks the words that
 * matched, and moves through them with the arrow keys.
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
 * @typedef {object} Ranked
 * @property {Entry} entry
 * @property {number} score
 * @property {string} snippet
 */

/**
 * @typedef {object} Hit
 * @property {Entry} entry
 * @property {string} snippet
 * @property {number} index
 */

/**
 * @typedef {object} Group
 * @property {string} label
 * @property {Hit[]} hits
 */

const PER_PAGE = 3;
const SHARED_BY = 5;
const LIMIT = 12;
const TITLE_WEIGHT = [0, 8, 25, 40];
const HEADING_WEIGHT = [0, 4, 10, 14];
const START_HERE = ["/learn/", "/guide/", "/guide/signals/", "/guide/templates/", "/guide/routing/", "/guide/command-line/"];

const styles = css`
    :scope { position: relative; }
    .trigger { display: flex; align-items: center; gap: var(--zl-space-3); width: 100%; height: 48px; margin: 0; padding: 0 var(--zl-space-3) 0 var(--zl-space-4); border: var(--zl-rule) solid var(--zl-control-line); border-radius: 0; background: var(--zl-bg); color: var(--zl-text-muted); font-family: var(--zl-font-text); font-size: 0.9375rem; text-align: left; cursor: pointer; }
    .trigger > span { flex: 1; }
    .trigger:hover { border-color: var(--zl-text); color: var(--zl-text); }
    .trigger:focus-visible { outline: none; border-color: var(--zl-focus); box-shadow: inset 0 0 0 1px var(--zl-focus); }
    kbd { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 var(--zl-space-1); border: var(--zl-rule) solid var(--zl-line); color: var(--zl-text-muted); font-family: var(--zl-font-mono); font-size: 0.6875rem; line-height: 1; }
    dialog { width: min(680px, calc(100vw - 2 * var(--zl-space-4))); max-width: none; max-height: min(620px, calc(100dvh - 2 * var(--zl-space-8))); margin: 12vh auto auto; padding: 0; overflow: hidden; border: var(--zl-rule) solid var(--zl-line); border-radius: 0; background: var(--zl-bg); color: var(--zl-text); box-shadow: 0 32px 64px -16px rgb(0 0 0 / 0.5), 0 8px 24px -8px rgb(0 0 0 / 0.3); }
    dialog[open] { display: flex; flex-direction: column; }
    dialog::backdrop { background: rgb(15 17 20 / 0.55); backdrop-filter: blur(3px); }
    .field { display: flex; flex: none; align-items: center; gap: var(--zl-space-3); padding: 0 var(--zl-space-3) 0 var(--zl-space-4); border-bottom: var(--zl-rule) solid var(--zl-line); }
    .field > svg { flex: none; color: var(--zl-text-muted); }
    .field input { flex: 1; min-width: 0; height: 60px; margin: 0; padding: 0; border: 0; background: none; color: var(--zl-text); font-family: var(--zl-font-text); font-size: 1.125rem; outline: none; }
    .field input::placeholder { color: var(--zl-text-muted); opacity: 1; }
    .close { display: grid; place-items: center; width: 40px; height: 40px; padding: 0; border: var(--zl-rule) solid transparent; border-radius: 0; background: none; color: var(--zl-text-muted); cursor: pointer; }
    .close:hover { border-color: var(--zl-line); color: var(--zl-text); }
    .close:focus-visible { outline: none; border-color: var(--zl-focus); color: var(--zl-text); }
    .results { flex: 1; min-height: 0; padding: var(--zl-space-2) 0; overflow: auto; overscroll-behavior: contain; }
    .label { margin: 0; padding: var(--zl-space-3) var(--zl-space-4) var(--zl-space-1); color: var(--zl-text-muted); font-family: var(--zl-font-mono); font-size: 0.6875rem; letter-spacing: 0.08em; text-transform: uppercase; }
    .option { position: relative; display: grid; gap: var(--zl-space-1); margin: 0 var(--zl-space-2); padding: var(--zl-space-2) 72px var(--zl-space-2) var(--zl-space-3); color: var(--zl-text); text-decoration: none; }
    .option[aria-selected="true"] { background: var(--zl-surface); box-shadow: inset 0 0 0 var(--zl-rule) var(--zl-focus); }
    .title { display: flex; flex-wrap: wrap; align-items: center; gap: var(--zl-space-1); font-weight: 500; }
    .title .page { color: var(--zl-text-muted); font-weight: 400; }
    .title > svg { width: 14px; height: 14px; color: var(--zl-text-muted); }
    .snippet { display: -webkit-box; overflow: hidden; color: var(--zl-text-muted); font-size: 0.8125rem; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    mark { padding: 0 2px; background: var(--zl-accent); color: var(--zl-on-accent); }
    .enter { position: absolute; top: 50%; right: var(--zl-space-3); display: none; padding: 3px 6px; transform: translateY(-50%); background: var(--zl-accent); color: var(--zl-on-accent); font-family: var(--zl-font-mono); font-size: 0.6875rem; line-height: 1; }
    .option[aria-selected="true"] .enter { display: block; }
    .status { margin: 0; padding: var(--zl-space-8) var(--zl-space-4); color: var(--zl-text-muted); text-align: center; }
    .status strong { color: var(--zl-text); font-weight: 500; }
    footer { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: var(--zl-space-4); padding: var(--zl-space-3) var(--zl-space-4); border-top: var(--zl-rule) solid var(--zl-line); color: var(--zl-text-muted); font-size: 0.8125rem; }
    footer .keys { display: contents; }
    footer .keys > span { display: inline-flex; align-items: center; gap: var(--zl-space-1); }
    footer .count { margin-left: auto; font-family: var(--zl-font-mono); font-size: 0.75rem; }
    @media (hover: none) { footer .keys, .option[aria-selected="true"] .enter { display: none; } }
    @media (max-width: 640px) { dialog { width: 100vw; height: 100dvh; max-height: none; margin: 0; border: 0; } }
`;

/** @returns {import("zerolith").View} */
function searchIcon()
{
    return html`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>`;
}

/** @returns {import("zerolith").View} */
function closeIcon()
{
    return html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18"/></svg>`;
}

/** @returns {import("zerolith").View} */
function chevronIcon()
{
    return html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M9 5L16 12L9 19"/></svg>`;
}

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
 * Whether a match at `at` starts a word: it opens the text, follows a
 * character that is not a letter or digit, or begins a capitalized part of
 * a camel-case name such as the Router in createRouter.
 * @param {string} text
 * @param {number} at
 * @returns {boolean}
 */
function startsWord(text, at)
{
    const before = text[at - 1] ?? "";
    return at === 0 || !/[a-z0-9]/i.test(before) || (/[a-z]/.test(before) && /[A-Z]/.test(text[at] ?? ""));
}

/**
 * How well a field holds a term: 3 when the field starts with it, 2 when a
 * word in it does, 1 when it appears inside a word, and 0 when it is absent.
 * @param {string} text
 * @param {string} term
 * @returns {number}
 */
function fit(text, term)
{
    const lower = text.toLowerCase();
    let best = 0;
    for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, at + 1))
    {
        if (at === 0)
        {
            return 3;
        }
        best = Math.max(best, startsWord(text, at) ? 2 : 1);
    }
    return best;
}

/**
 * The weight of a term in the text: each of its first five occurrences
 * counts, and one that starts a word counts three times.
 * @param {string} text
 * @param {string} term
 * @returns {number}
 */
function weight(text, term)
{
    const lower = text.toLowerCase();
    let total = 0;
    let seen = 0;
    for (let at = lower.indexOf(term); at !== -1 && seen < 5; at = lower.indexOf(term, at + term.length))
    {
        seen++;
        total += startsWord(text, at) ? 3 : 1;
    }
    return total;
}

/**
 * The text from `start` to `end` moved out to whole words, with an
 * ellipsis on each side where it was cut.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
function clip(text, start, end)
{
    let from = start;
    while (from > 0 && /\S/.test(text[from - 1] ?? ""))
    {
        from--;
    }
    let to = Math.min(text.length, end);
    const space = text.lastIndexOf(" ", to);
    if (to < text.length && space > from)
    {
        to = space;
    }
    return `${from > 0 ? "..." : ""}${text.slice(from, to).trim()}${to < text.length ? "..." : ""}`;
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
    const start = first === -1 ? 0 : Math.max(0, first - 50);
    return clip(text, start, start + 150);
}

/** @type {WeakMap<readonly Entry[], Set<string>>} */
const sharedCache = new WeakMap();

/**
 * The section headings that many pages share, such as a diagnostic's What
 * happened and What to do, which say nothing about a page on their own.
 * @param {readonly Entry[]} entries
 * @returns {Set<string>}
 */
function sharedHeadings(entries)
{
    const cached = sharedCache.get(entries);
    if (cached !== undefined)
    {
        return cached;
    }
    /** @type {Map<string, Set<string>>} */
    const pages = new Map();
    for (const entry of entries.filter((candidate) => candidate.anchor !== ""))
    {
        const heading = entry.heading.toLowerCase();
        pages.set(heading, (pages.get(heading) ?? new Set()).add(entry.path));
    }
    const shared = new Set(Array.from(pages).filter(([, paths]) => paths.size >= SHARED_BY).map(([heading]) => heading));
    sharedCache.set(entries, shared);
    return shared;
}

/**
 * Ranks entries for a query. Every term must appear in the entry. A term
 * that starts the page title weighs most, then one that starts a word of
 * the title, then one inside it; the section heading follows the same order
 * at lower weights, and the text below that. An exact title or heading adds
 * more, and a page's own entry edges out its sections. A page keeps its
 * three best entries, and a heading many pages share only when it is the
 * page's best.
 * @param {readonly Entry[]} entries
 * @param {string} query
 * @returns {Ranked[]}
 */
export function rank(entries, query)
{
    const words = terms(query);
    if (words.length === 0)
    {
        return [];
    }
    const phrase = words.join(" ");
    /** @type {Ranked[]} */
    const hits = [];
    for (const entry of entries)
    {
        let score = 0;
        for (const word of words)
        {
            const inTitle = fit(entry.title, word);
            const inHeading = fit(entry.heading, word);
            const inText = weight(entry.text, word);
            if (inTitle + inHeading + inText === 0)
            {
                score = 0;
                break;
            }
            score += (TITLE_WEIGHT[inTitle] ?? 0) + (HEADING_WEIGHT[inHeading] ?? 0) + inText;
        }
        if (score > 0)
        {
            score += (entry.title.toLowerCase() === phrase ? 60 : 0) + (entry.heading.toLowerCase() === phrase ? 30 : 0) + (entry.anchor === "" ? 5 : 0);
            hits.push({ entry, score, snippet: snippet(entry.text, words) });
        }
    }
    const shared = sharedHeadings(entries);
    /** @type {Map<string, number>} */
    const perPage = new Map();
    return hits
        .toSorted((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
        .filter((hit) =>
        {
            const kept = perPage.get(hit.entry.path) ?? 0;
            if (kept >= PER_PAGE || (kept > 0 && shared.has(hit.entry.heading.toLowerCase())))
            {
                return false;
            }
            perPage.set(hit.entry.path, kept + 1);
            return true;
        })
        .slice(0, LIMIT);
}

/**
 * Groups ranked hits by section, in the order of each section's best hit,
 * and numbers them in the order they show, which the arrow keys follow.
 * @param {readonly Ranked[]} ranked
 * @returns {Group[]}
 */
export function group(ranked)
{
    /** @type {Map<string, Ranked[]>} */
    const sections = new Map();
    for (const hit of ranked)
    {
        const list = sections.get(hit.entry.section) ?? [];
        list.push(hit);
        sections.set(hit.entry.section, list);
    }
    let index = 0;
    return Array.from(sections, ([label, hits]) => ({ label, hits: hits.map((hit) => ({ entry: hit.entry, snippet: hit.snippet, index: index++ })) }));
}

/**
 * The pages offered before anything is typed, as one group.
 * @param {readonly Entry[]} entries
 * @returns {Group[]}
 */
function startHere(entries)
{
    const pages = START_HERE.flatMap((path) => entries.filter((entry) => entry.anchor === "" && entry.path.endsWith(path)).slice(0, 1));
    if (pages.length === 0)
    {
        return [];
    }
    return [{ label: "Start here", hits: pages.map((entry, index) => ({ entry, snippet: snippet(entry.text, []), index })) }];
}

/**
 * The text split into the runs a query matched and the runs between them. A
 * term is matched where it starts a word; in a title it is also matched
 * inside a word when it starts none, and in prose a one-letter term is not
 * matched at all, so a snippet is not dotted with marks.
 * @param {string} text
 * @param {readonly string[]} words
 * @param {boolean} prose
 * @returns {Array<{ text: string, match: boolean }>}
 */
export function segments(text, words, prose)
{
    const lower = text.toLowerCase();
    /** @type {Array<[number, number]>} */
    const ranges = [];
    for (const word of words.filter((candidate) => !prose || candidate.length > 1))
    {
        /** @type {Array<[number, number]>} */
        const all = [];
        for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + word.length))
        {
            all.push([at, at + word.length]);
        }
        const starts = all.filter(([at]) => startsWord(text, at));
        ranges.push(...(starts.length > 0 || prose ? starts : all));
    }
    /** @type {Array<{ text: string, match: boolean }>} */
    const out = [];
    let cursor = 0;
    for (const [start, end] of ranges.toSorted((a, b) => a[0] - b[0]))
    {
        if (end <= cursor)
        {
            continue;
        }
        const from = Math.max(start, cursor);
        if (from > cursor)
        {
            out.push({ text: text.slice(cursor, from), match: false });
        }
        out.push({ text: text.slice(from, end), match: true });
        cursor = end;
    }
    if (cursor < text.length)
    {
        out.push({ text: text.slice(cursor), match: false });
    }
    return out;
}

/**
 * The text with the matched runs wrapped in mark elements.
 * @param {string} text
 * @param {readonly string[]} words
 * @param {boolean} prose
 * @returns {Array<string | import("zerolith").View>}
 */
function marked(text, words, prose)
{
    return segments(text, words, prose).map((part) => (part.match ? html`<mark>${part.text}</mark>` : part.text));
}

/**
 * @param {Entry} entry
 * @returns {string}
 */
function href(entry)
{
    return entry.anchor === "" ? entry.path : `${entry.path}#${entry.anchor}`;
}

/**
 * An element id for an entry's option, unique within the dialog.
 * @param {Entry} entry
 * @returns {string}
 */
function optionId(entry)
{
    return `search-${`${entry.path}-${entry.anchor}`.replace(/[^a-z0-9-]+/gi, "-")}`;
}

/** The search button and the dialog it opens. */
export function Search()
{
    const query = signal("");
    const opened = signal(false);
    const active = signal(0);
    const dialog = signal(/** @type {HTMLDialogElement | undefined} */ (undefined));
    const field = signal(/** @type {HTMLInputElement | undefined} */ (undefined));
    const index = resource({
        params: () => (opened.get() ? new URL("search.json", import.meta.url).href : undefined),
        loader: async ({ params, abort }) => /** @type {Entry[]} */ (await (await fetch(params, { signal: abort })).json())
    });
    const words = computed(() => terms(query.get()));
    const ranked = computed(() => rank(index.get() ?? [], query.get()));
    const groups = computed(() => (words.get().length === 0 ? startHere(index.get() ?? []) : group(ranked.get())));
    const flat = computed(() => groups.get().flatMap((entry) => entry.hits));
    const activeId = computed(() =>
    {
        const hit = flat.get()[active.get()];
        return hit === undefined ? null : optionId(hit.entry);
    });
    const nothing = computed(() => words.get().length > 0 && index.get() !== undefined && flat.get().length === 0);
    const count = computed(() =>
    {
        if (words.get().length === 0)
        {
            return "";
        }
        const total = ranked.get().length;
        if (total === 0)
        {
            return "";
        }
        return total === 1 ? "1 result" : `${total} results`;
    });

    const open = () =>
    {
        const element = dialog.get();
        if (element === undefined || element.open)
        {
            return;
        }
        opened.set(true);
        element.showModal();
        field.get()?.select();
    };
    const close = () => dialog.get()?.close();
    const reveal = () => requestAnimationFrame(() => document.getElementById(activeId.get() ?? "")?.scrollIntoView({ block: "nearest" }));
    /** @param {Event} event */
    const onInput = (event) =>
    {
        query.set(/** @type {HTMLInputElement} */ (event.currentTarget).value);
        active.set(0);
    };
    /** @param {KeyboardEvent} event */
    const onKeydown = (event) =>
    {
        const total = flat.get().length;
        if (event.key === "ArrowDown" || event.key === "ArrowUp")
        {
            event.preventDefault();
            if (total > 0)
            {
                active.set((active.get() + (event.key === "ArrowDown" ? 1 : -1) + total) % total);
                reveal();
            }
        }
        else if (event.key === "Enter")
        {
            const hit = flat.get()[active.get()];
            if (hit !== undefined)
            {
                event.preventDefault();
                close();
                location.assign(href(hit.entry));
            }
        }
    };
    /** @param {MouseEvent} event */
    const onDialogClick = (event) =>
    {
        if (event.target === event.currentTarget)
        {
            close();
        }
    };

    return html`
        <div class=${styles} role="search">
            <button type="button" class="trigger" aria-haspopup="dialog" @click=${open}>${searchIcon()}<span>Search the docs</span><kbd>/</kbd></button>
            <dialog ref=${dialog} aria-label="Search the documentation" @click=${onDialogClick} @close=${() => active.set(0)}>
                <div class="field">
                    ${searchIcon()}
                    <input ref=${field} type="text" inputmode="search" enterkeyhint="go" role="combobox" aria-autocomplete="list" aria-controls="search-results" aria-expanded=${computed(() => String(flat.get().length > 0))} aria-activedescendant=${activeId} placeholder="Search guides, the reference, and diagnostics" autocomplete="off" spellcheck="false" autofocus .value=${query} @input=${onInput} @keydown=${onKeydown}>
                    <button type="button" class="close" aria-label="Close search" @click=${close}>${closeIcon()}</button>
                </div>
                <div class="results" id="search-results" role="listbox" aria-label="Results">
                    ${each(groups, (section) => section.label, (section) =>
                    {
                        const { label } = section.get();
                        const labelId = `search-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                        return html`
                            <div role="group" aria-labelledby=${labelId}>
                                <p class="label" id=${labelId}>${label}</p>
                                ${each(computed(() => section.get().hits), (hit) => `${hit.entry.path}#${hit.entry.anchor}`, (hit) =>
                                {
                                    const { entry: page } = hit.get();
                                    const title = page.anchor === ""
                                        ? html`<span>${computed(() => marked(page.title, words.get(), false))}</span>`
                                        : html`<span class="page">${computed(() => marked(page.title, words.get(), false))}</span>${chevronIcon()}<span>${computed(() => marked(page.heading, words.get(), false))}</span>`;
                                    return html`
                                        <a class="option" role="option" id=${optionId(page)} href=${href(page)} aria-selected=${computed(() => String(active.get() === hit.get().index))} @mousemove=${() => active.set(hit.get().index)} @click=${close}>
                                            <span class="title">${title}</span>
                                            <span class="snippet">${computed(() => marked(hit.get().snippet, words.get(), true))}</span>
                                            <span class="enter" aria-hidden="true">Enter</span>
                                        </a>`;
                                })}
                            </div>`;
                    })}
                    ${when(nothing, () => html`<p class="status">Nothing matches <strong>${query}</strong>. Try one word, an API name such as createRouter, or a diagnostic code.</p>`)}
                    ${when(index.error, () => html`<p class="status">The search index did not load. Close search and try again.</p>`)}
                </div>
                <footer>
                    <span class="keys">
                        <span><kbd>Up</kbd><kbd>Down</kbd> to move</span>
                        <span><kbd>Enter</kbd> to open</span>
                        <span><kbd>Esc</kbd> to close</span>
                    </span>
                    <span class="count">${count}</span>
                </footer>
            </dialog>
        </div>`;
}
