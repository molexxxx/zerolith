/**
 * The site in the browser, a single-page application on @zerolith/router.
 * The docs build prerenders every page, so a first load, a search engine,
 * and a reader without JavaScript get the whole page. The router then takes
 * over the page's links: its one route loads the next page's prerendered
 * HTML, the outlet renders that page's body, and the router sets the title
 * and description, scrolls to the top or to the hash, and restores the
 * position on back and forward. Each page's controls and islands (the theme
 * toggle, the menu, the copy buttons, the file tabs, the search, the home
 * page's running figure, and the playground) start when the page commits
 * and stop when the reader leaves it. The import map resolves `zerolith` and
 * `@zerolith/router` to the production builds the docs build copied next to
 * this file.
 */
import { hydrate, render } from "zerolith";
import { createRouter, defineRoutes, route } from "@zerolith/router";
import { Search } from "./search.js";

/**
 * @typedef {object} Page
 * @property {Node[]} nodes
 * @property {{ title?: string, description?: string }} head
 * @property {string | undefined} canonical
 * @property {string | undefined} markdown
 */

const root = document.documentElement;
const prefersLight = matchMedia("(prefers-color-scheme: light)");
const base = new URL(".", import.meta.url).pathname;

/** A load the router should leave to the browser: a file that is not a page, or a response that is not HTML. */
class FullLoad extends Error
{
}

/**
 * Keeps the reader's choice for the next visit; storage can be unavailable, and then the choice lasts for this visit.
 * @param {string} theme
 * @returns {boolean}
 */
function remember(theme)
{
    try
    {
        localStorage.setItem("zerolith-docs-theme", theme);
        return true;
    }
    catch
    {
        return false;
    }
}

/**
 * Copies the text a copy button names, or its code block's text, and shows
 * the check icon for a moment.
 * @param {HTMLButtonElement} button
 * @returns {Promise<void>}
 */
async function copy(button)
{
    const label = button.getAttribute("data-label") ?? "Copy";
    const source = button.closest(".file")?.querySelector(".file-source pre") ?? button.closest(".code")?.querySelector("pre");
    const text = button.getAttribute("data-copy") ?? source?.textContent ?? "";
    try
    {
        await navigator.clipboard.writeText(text);
    }
    catch
    {
        return;
    }
    button.setAttribute("data-copied", "");
    button.setAttribute("aria-label", "Copied");
    setTimeout(() =>
    {
        button.removeAttribute("data-copied");
        button.setAttribute("aria-label", label);
    }, 1500);
}

/** Wires the controls of the page in the document: the theme toggle, the menu, the copy buttons, and the file tabs. */
function wireControls()
{
    document.querySelector(".theme-toggle")?.addEventListener("click", () =>
    {
        const current = root.getAttribute("data-theme") ?? (prefersLight.matches ? "light" : "dark");
        const next = current === "light" ? "dark" : "light";
        root.setAttribute("data-theme", next);
        remember(next);
    });

    const menu = document.querySelector(".menu-toggle");
    menu?.addEventListener("click", () =>
    {
        const open = menu.getAttribute("aria-expanded") !== "true";
        menu.setAttribute("aria-expanded", String(open));
        root.toggleAttribute("data-menu-open", open);
    });

    for (const button of document.querySelectorAll(".copy"))
    {
        button.setAttribute("data-label", button.getAttribute("aria-label") ?? "Copy");
        button.addEventListener("click", () => copy(/** @type {HTMLButtonElement} */ (button)));
    }

    for (const list of document.querySelectorAll(".file [role=\"tablist\"]"))
    {
        const tabs = /** @type {HTMLElement[]} */ (Array.from(list.querySelectorAll("[role=\"tab\"]")));
        /** @param {Element} chosen */
        const choose = (chosen) =>
        {
            for (const tab of tabs)
            {
                const selected = tab === chosen;
                tab.setAttribute("aria-selected", String(selected));
                tab.setAttribute("tabindex", selected ? "0" : "-1");
                document.getElementById(tab.getAttribute("aria-controls") ?? "")?.toggleAttribute("hidden", !selected);
            }
        };
        for (const tab of tabs)
        {
            tab.addEventListener("click", () => choose(tab));
            tab.addEventListener("keydown", (event) =>
            {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
                {
                    return;
                }
                const next = tabs[(tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                if (next !== undefined)
                {
                    choose(next);
                    next.focus();
                }
            });
        }
    }
}

/**
 * Whether a URL names a page the router can load: a folder or an HTML file,
 * not a Markdown twin, a text file, or JSON.
 * @param {URL} url
 * @returns {boolean}
 */
function isPage(url)
{
    const name = url.pathname.slice(url.pathname.lastIndexOf("/") + 1);
    return name === "" || name.endsWith(".html") || !name.includes(".");
}

/**
 * The HTML of a page; a response that is not HTML is left to the browser.
 * @param {string} path
 * @param {AbortSignal | undefined} abort
 * @returns {Promise<string>}
 */
async function request(path, abort)
{
    const response = await fetch(path, { signal: abort ?? null, headers: { accept: "text/html" } });
    if (!(response.headers.get("content-type") ?? "").includes("text/html"))
    {
        throw new FullLoad(path);
    }
    return response.text();
}

/** @type {Map<string, Promise<string | undefined>>} */
const prefetched = new Map();

/**
 * Starts loading a page the reader is about to open, so the click finds it ready.
 * @param {Event} event
 */
function prefetch(event)
{
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(anchor instanceof HTMLAnchorElement) || anchor.origin !== location.origin || !anchor.pathname.startsWith(base) || anchor.hasAttribute("download") || anchor.target !== "")
    {
        return;
    }
    const url = new URL(anchor.href);
    const path = url.pathname + url.search;
    if (url.pathname === location.pathname || !isPage(url) || prefetched.has(path))
    {
        return;
    }
    prefetched.set(path, request(path, undefined).catch(() => undefined));
}

/**
 * Adds the component styles a fetched page carries that this document lacks,
 * before its nodes render.
 * @param {Document} fetched
 */
function adoptStyles(fetched)
{
    const present = new Set(Array.from(document.head.querySelectorAll(":scope > style"), (style) => style.textContent));
    for (const style of fetched.head.querySelectorAll(":scope > style"))
    {
        if (!present.has(style.textContent))
        {
            document.head.append(document.adoptNode(style));
        }
    }
}

/**
 * The page the server sent, which the first navigation takes over as it is.
 * @returns {Page}
 */
function serverPage()
{
    return { nodes: Array.from(document.body.childNodes), head: {}, canonical: undefined, markdown: undefined };
}

/**
 * Loads the page at `url` from the prefetched copy or the network and adopts
 * its body's nodes.
 * @param {URL} url
 * @param {AbortSignal} abort
 * @returns {Promise<Page>}
 */
async function loadPage(url, abort)
{
    if (!isPage(url))
    {
        throw new FullLoad(url.href);
    }
    const path = url.pathname + url.search;
    const early = prefetched.get(path);
    prefetched.delete(path);
    const html = (early === undefined ? undefined : await early) ?? await request(path, abort);
    const fetched = new DOMParser().parseFromString(html, "text/html");
    adoptStyles(fetched);
    const description = fetched.querySelector("meta[name=\"description\"]")?.getAttribute("content");
    return {
        nodes: Array.from(fetched.body.childNodes).map((node) => document.adoptNode(node)),
        head: description === null || description === undefined ? { title: fetched.title } : { title: fetched.title, description },
        canonical: fetched.querySelector("link[rel=\"canonical\"]")?.getAttribute("href") ?? undefined,
        markdown: fetched.querySelector("link[rel=\"alternate\"][type=\"text/markdown\"]")?.getAttribute("href") ?? undefined
    };
}

let first = true;
const routes = defineRoutes({
    page: route({
        path: "/*rest",
        load: ({ url, abort }) =>
        {
            if (first)
            {
                first = false;
                return Promise.resolve(serverPage());
            }
            return loadPage(url, abort);
        },
        view: ({ data }) => data.nodes,
        head: ({ data }) => data.head
    })
});

/** @type {Array<() => void>} */
let leaving = [];
let visits = 0;
const announcer = document.createElement("p");
announcer.className = "visually-hidden";
announcer.setAttribute("aria-live", "polite");

/**
 * Starts the page that just committed: its controls, the search, and the
 * figure or the playground when the page has one, after stopping what the
 * previous page started. The playground module's type is given by hand:
 * TypeScript resolves `./playground.js` to the server module beside it,
 * `playground.ts`, while the browser loads `playground.js`.
 * @param {"push" | "replace" | "pop"} mode
 * @param {Page | undefined} page
 */
function arrive(mode, page)
{
    for (const stop of leaving)
    {
        stop();
    }
    leaving = [];
    const visit = ++visits;
    root.removeAttribute("data-menu-open");
    wireControls();

    const search = document.querySelector("[data-island=\"search\"]");
    if (search !== null)
    {
        const hydrated = hydrate(Search(), search);
        leaving.push(() => hydrated.dispose());
    }
    const figure = document.querySelector("[data-island=\"figure\"]");
    if (figure !== null)
    {
        void import("./demo.js").then(({ Figure, reset, watch }) =>
        {
            if (visit !== visits)
            {
                return;
            }
            reset();
            const hydrated = hydrate(Figure(), figure);
            const stop = watch(figure);
            leaving.push(() =>
            {
                stop();
                hydrated.dispose();
            });
        });
    }
    const playground = document.querySelector("[data-playground]");
    if (playground instanceof HTMLElement)
    {
        void import("./playground.js").then((loaded) =>
        {
            const { start } = /** @type {{ start: (host: HTMLElement) => () => void }} */ (/** @type {unknown} */ (loaded));
            if (visit === visits)
            {
                leaving.push(start(playground));
            }
        });
    }

    if (page?.canonical !== undefined)
    {
        document.querySelector("link[rel=\"canonical\"]")?.setAttribute("href", page.canonical);
    }
    if (page?.markdown !== undefined)
    {
        document.querySelector("link[rel=\"alternate\"][type=\"text/markdown\"]")?.setAttribute("href", page.markdown);
    }
    if (visit > 1)
    {
        announcer.textContent = document.title;
        if (mode !== "pop" && location.hash === "")
        {
            const main = document.querySelector("main");
            main?.setAttribute("tabindex", "-1");
            main?.focus({ preventScroll: true });
        }
    }
}

const router = createRouter(routes, {
    base,
    onError: (error, url) =>
    {
        if (!(error instanceof DOMException && error.name === "AbortError"))
        {
            location.assign(url.href);
        }
    },
    observe: (event) =>
    {
        if (event.type === "commit")
        {
            arrive(event.mode, /** @type {Page | undefined} */ (router.current.get()?.data));
        }
    }
});
render(router.outlet(), document.body);
document.body.append(announcer);

document.addEventListener("pointerover", prefetch);
document.addEventListener("focusin", prefetch);
document.addEventListener("keydown", (event) =>
{
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
    const shortcut = ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k")
        || (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey);
    const trigger = document.querySelector("[data-island=\"search\"] .trigger");
    if (shortcut && trigger instanceof HTMLButtonElement)
    {
        event.preventDefault();
        trigger.click();
    }
});
