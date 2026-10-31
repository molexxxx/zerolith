/**
 * Wires the page's controls, the theme toggle, the menu on narrow screens,
 * the copy buttons, and the Preview and Source tabs of a Markdown file
 * shown on a page, then hydrates the page's islands: the search, which
 * Ctrl+K and / open from anywhere on the page, the home page's running
 * figure, and the playground, each loaded only on a page that has it. The page's import map resolves `zerolith` to the production
 * build the docs build copied next to this file.
 */
import { hydrate } from "zerolith";
import { Search } from "./search.js";

const root = document.documentElement;
const prefersLight = matchMedia("(prefers-color-scheme: light)");

/**
 * Keeps the reader's choice for the next page; storage can be unavailable, and then the choice lasts for this page.
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

const search = document.querySelector("[data-island=\"search\"]");
if (search !== null)
{
    hydrate(Search(), search);
    document.addEventListener("keydown", (event) =>
    {
        const target = event.target;
        const typing = target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
        const shortcut = ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k")
            || (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey);
        const trigger = search.querySelector(".trigger");
        if (shortcut && trigger instanceof HTMLButtonElement)
        {
            event.preventDefault();
            trigger.click();
        }
    });
}

const figure = document.querySelector("[data-island=\"figure\"]");
if (figure !== null)
{
    const { Figure, watch } = await import("./demo.js");
    hydrate(Figure(), figure);
    watch(figure);
}

if (document.querySelector("[data-playground]") !== null)
{
    await import("./playground.js");
}
