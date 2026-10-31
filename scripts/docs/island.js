/**
 * Wires the page's controls, the theme toggle, the menu on narrow screens,
 * and the copy buttons, then hydrates the page's islands: the search, the
 * home page's running figure, and the playground, each loaded only on a page
 * that has it. The page's import map resolves `zerolith` to the production
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
    const text = button.getAttribute("data-copy") ?? button.closest(".code")?.querySelector("pre")?.textContent ?? "";
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

const search = document.querySelector("[data-island=\"search\"]");
if (search !== null)
{
    hydrate(Search(), search);
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
