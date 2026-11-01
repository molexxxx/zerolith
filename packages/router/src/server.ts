/**
 * @zerolith/router/server: the server side of routing, kept out of the
 * browser entry so an import map never has to resolve the server renderer.
 */
import { escapeAttribute, escapeText } from "zerolith/ssr";
import type { EmbeddedRouteState, Head, RouteTable, Router } from "./router.js";

/** Renders head metadata as the `<title>` and `<meta name="description">` elements of a server-rendered document. */
export function renderHead(head: Head): string
{
    const parts: string[] = [];
    if (head.title !== undefined)
    {
        parts.push(`<title>${escapeText(head.title)}</title>`);
    }
    if (head.description !== undefined)
    {
        parts.push(`<meta name="description" content="${escapeAttribute(head.description)}">`);
    }
    return parts.join("");
}

/**
 * Renders the `<script>` that hands the current route's loaded data to the
 * browser, where the router reuses it for the initial navigation instead of
 * running the loader again, as long as the route and URL still match.
 * Empty when nothing matched or the route produced no data. The data goes
 * through JSON, so the browser's first navigation receives the JSON form: a
 * `Date` arrives as a string, a `Map` as an empty object, a field holding
 * `undefined` is left out, and a `BigInt` throws here. Return plain JSON
 * from a loader whose page is server-rendered.
 */
export function renderRouteState(router: Router<RouteTable>): string
{
    const match = router.current.get();
    if (match === undefined || match.data === undefined)
    {
        return "";
    }
    const state: EmbeddedRouteState = { name: match.name, href: match.url.pathname + match.url.search, data: match.data };
    return `<script type="application/json" data-zerolith-route>${JSON.stringify(state).replace(/</g, "\\u003c")}</script>`;
}
