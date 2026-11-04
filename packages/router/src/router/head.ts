/**
 * Head metadata: the fields a navigation shows, merged from the router's
 * defaults and the matched route's own.
 */
import type { Head, Match, RouteDefinition, RouterOptions } from "./types.js";

/** The route's own head fields, or none for the fallback or a route without `head`. */
function ownHead(match: Match | undefined, route: RouteDefinition<string, unknown> | undefined): Head
{
    if (route === undefined || match === undefined)
    {
        return {};
    }
    const { head: declared } = route;
    if (declared === undefined)
    {
        return {};
    }
    return typeof declared === "function" ? declared({ params: match.params, data: match.data, url: match.url }) : declared;
}

/** The head the document shows for a navigation: the defaults, with the matched route's own fields over them. */
export function headOf(match: Match | undefined, route: RouteDefinition<string, unknown> | undefined, target: URL, defaults: RouterOptions["head"]): Head
{
    const merged: Head = { ...(typeof defaults === "function" ? defaults({ url: target, name: match?.name }) : defaults) };
    const own = ownHead(match, route);
    if (own.title !== undefined)
    {
        merged.title = own.title;
    }
    if (own.description !== undefined)
    {
        merged.description = own.description;
    }
    return merged;
}
