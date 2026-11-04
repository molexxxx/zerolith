/**
 * The route state the server embeds in the page, which the browser's
 * initial navigation reads once instead of running the loader again.
 */
import type { EmbeddedRouteState } from "./types.js";

/** The selector of the script `renderRouteState` writes. */
export const ROUTE_STATE_SELECTOR: string = "script[type=\"application/json\"][data-zerolith-route]";

/** Reads and removes the embedded route state, if the server left one; used once, for the initial navigation, whatever it resolves to. A record without a `data` member is not one the server wrote. */
export function readEmbeddedState(doc: Document): EmbeddedRouteState | undefined
{
    const script = doc.querySelector(ROUTE_STATE_SELECTOR);
    if (script === null)
    {
        return undefined;
    }
    script.remove();
    try
    {
        const parsed = JSON.parse(script.textContent ?? "") as Partial<EmbeddedRouteState>;
        return typeof parsed.name === "string" && typeof parsed.href === "string" && "data" in parsed ? { name: parsed.name, href: parsed.href, data: parsed.data } : undefined;
    }
    catch
    {
        return undefined;
    }
}
