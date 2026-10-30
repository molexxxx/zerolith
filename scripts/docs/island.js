/**
 * Hydrates the search island and wires the page's other controls: the theme
 * toggle, the menu on narrow screens, and the copy button on each code block.
 * The page's import map resolves `zerolith` to the production build the docs
 * build copied next to this file.
 */
import { hydrate } from "zerolith";
import { Search } from "./search.js";

const host = document.querySelector("[data-island=\"search\"]");
if (host !== null)
{
    hydrate(Search(), host);
}

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
const sidebar = document.getElementById("sidebar");
menu?.addEventListener("click", () =>
{
    const open = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(open));
    sidebar?.classList.toggle("open", open);
});

/**
 * Copies a code block's text and shows the check icon for a moment.
 * @param {HTMLButtonElement} button
 * @returns {Promise<void>}
 */
async function copy(button)
{
    const text = button.closest(".code")?.querySelector("pre")?.textContent ?? "";
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
        button.setAttribute("aria-label", "Copy code");
    }, 1500);
}

for (const button of document.querySelectorAll(".code .copy"))
{
    button.addEventListener("click", () => copy(/** @type {HTMLButtonElement} */ (button)));
}
