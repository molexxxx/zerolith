/**
 * The home page's running figure: a counter the docs build renders on the
 * server and the browser hydrates from the production build. The page shows
 * the `figure` region of this file as the figure's code, and the readout
 * reports what each update changed in the DOM, measured by a
 * MutationObserver on the output, and how often the component ran.
 */
import { computed, html, signal } from "zerolith";

// #region figure
const count = signal(1);
const doubled = computed(() => count.get() * 2);

function Counter()
{
    const add = () => count.set(count.get() + 1);
    return html`
        <p>Count: ${count}, doubled: ${doubled}</p>
        <button @click=${add}>Add one</button>`;
}
// #endregion figure

const calls = signal(0);
const textNodes = signal(0);
const elements = signal(0);

/** Counter, counted: the readout's call count comes from here. */
function counted()
{
    calls.set(calls.get() + 1);
    return Counter();
}

/** The figure: the counter in its output pane and the readout under it. */
export function Figure()
{
    return html`
        <div class="output">${counted()}</div>
        <dl class="readout">
            <div><dt>Text nodes changed</dt><dd>${textNodes}</dd></div>
            <div><dt>Elements created</dt><dd>${elements}</dd></div>
            <div><dt>Counter() calls</dt><dd>${calls}</dd></div>
        </dl>`;
}

/**
 * Measures every update of the hydrated figure inside `host` and marks what
 * it changed: the text nodes in the output, and the bound expressions in the
 * figure's code. Marks use the CSS Custom Highlight API and are skipped where
 * a browser lacks it; the readout works either way.
 * @param {Element} host
 * @returns {void}
 */
export function watch(host)
{
    const output = host.querySelector(".output");
    const figure = host.closest("figure");
    if (output === null)
    {
        return;
    }
    /** @type {Map<Node, string>} */
    const bound = new Map();
    for (const node of output.querySelector("p")?.childNodes ?? [])
    {
        if (node.nodeType === Node.TEXT_NODE && node.textContent === String(count.get()))
        {
            bound.set(node, "count");
        }
        else if (node.nodeType === Node.TEXT_NODE && node.textContent === String(doubled.get()))
        {
            bound.set(node, "doubled");
        }
    }
    const highlights = "highlights" in CSS && typeof Highlight === "function" ? CSS.highlights : undefined;
    const outputMarks = highlights === undefined ? undefined : new Highlight();
    const codeMarks = highlights === undefined ? undefined : new Highlight();
    if (highlights !== undefined && outputMarks !== undefined && codeMarks !== undefined)
    {
        highlights.set("live-output", outputMarks);
        highlights.set("live-code", codeMarks);
    }
    new MutationObserver((records) =>
    {
        /** @type {Set<Node>} */
        const changed = new Set();
        let created = 0;
        for (const record of records)
        {
            if (record.type === "characterData")
            {
                changed.add(record.target);
            }
            for (const node of record.addedNodes)
            {
                if (node.nodeType === Node.ELEMENT_NODE)
                {
                    created++;
                }
                else if (node.nodeType === Node.TEXT_NODE)
                {
                    changed.add(node);
                }
            }
        }
        textNodes.set(changed.size);
        elements.set(created);
        if (outputMarks === undefined || codeMarks === undefined)
        {
            return;
        }
        outputMarks.clear();
        codeMarks.clear();
        for (const node of changed)
        {
            outputMarks.add(rangeOf(node));
            const name = bound.get(node);
            for (const token of figure?.querySelectorAll(`[data-signal="${name}"]`) ?? [])
            {
                codeMarks.add(rangeOf(token));
            }
        }
    }).observe(output, { characterData: true, childList: true, subtree: true });
}

/**
 * @param {Node} node
 * @returns {Range}
 */
function rangeOf(node)
{
    const range = new Range();
    range.selectNodeContents(node);
    return range;
}
