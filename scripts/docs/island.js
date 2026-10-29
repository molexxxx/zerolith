/**
 * Hydrates the search island. The page's import map resolves `zerolith` to
 * the production build the docs build copied next to this file.
 */
import { hydrate } from "zerolith";
import { Search } from "./search.js";

const host = document.querySelector("[data-island=\"search\"]");
if (host !== null)
{
    hydrate(Search(), host);
}
