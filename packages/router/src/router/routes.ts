/**
 * Route declarations: the functions that declare a route, a table, and a
 * lazy view, the check of a path the matcher must be able to read, and the
 * router's own coded errors.
 */
import { DIAGNOSTIC_URL, ZerolithError, diagnosticCatalog } from "zerolith";
import type { LazyView, RouteDefinition, RouteTable, RouteView } from "./types.js";

/** Declares one route, inferring its parameters from the path and its data from the loader. */
export function route<const Path extends string, Data = undefined>(definition: RouteDefinition<Path, Data>): RouteDefinition<Path, Data>
{
    return definition;
}

/** Declares the route table, preserving every name and path for `href()`; it returns its argument. */
export function defineRoutes<const T extends RouteTable>(routes: T): T
{
    return routes;
}

/** Marks a view to be imported on first navigation. */
export function lazy<Params, Data>(loader: () => Promise<RouteView<Params, Data>>): LazyView<Params, Data>
{
    return { lazy: loader };
}

/** True for a view `lazy()` made. */
export function isLazy(view: unknown): view is LazyView<unknown, unknown>
{
    return typeof view === "object" && view !== null && "lazy" in view;
}

/** An error of the router's own, built from the core's catalog as the core builds its own. */
export function routerError(code: "route_name_unknown" | "route_path_invalid", args: Readonly<Record<string, string>>): ZerolithError
{
    const text = diagnosticCatalog[code];
    return new ZerolithError({ code, severity: "error", cause: text?.cause ?? "", fix: text?.fix ?? "", url: `${DIAGNOSTIC_URL}${code}/?${new URLSearchParams(args).toString()}`, args });
}

/** The error `href()` throws for a name the route table does not hold. */
export function unknownRoute(name: string): ZerolithError
{
    return routerError("route_name_unknown", { name });
}

/**
 * Refuses a path the matcher cannot read as written: a `*rest` segment that
 * is not the last, a second one, a parameter with no name, or a modifier
 * such as `?` or `+` after a name, which would be read as part of it.
 */
export function checkPath(name: string, path: string): void
{
    const segments = path.split("/").filter((segment) => segment !== "");
    let stars = 0;
    for (const [index, segment] of segments.entries())
    {
        const parameter = segment.startsWith(":") || segment.startsWith("*");
        if (!parameter)
        {
            continue;
        }
        const label = segment.slice(1);
        if (label === "" || /[?*+:()[\]{}]/.test(label))
        {
            throw routerError("route_path_invalid", { name, path });
        }
        if (segment.startsWith("*"))
        {
            stars++;
            if (stars > 1 || index !== segments.length - 1)
            {
                throw routerError("route_path_invalid", { name, path });
            }
        }
    }
}
