/**
 * @zerolith/router: typed client-side routing for zerolith.
 */
export type { ParamsOf } from "./match.js";
export type {
    AnyRoute,
    Head,
    HrefArgs,
    LazyView,
    LoadContext,
    Match,
    RouteContext,
    RouteDefinition,
    RouteTable,
    RouteView,
    Router,
    RouterOptions
} from "./router.js";
export { createRouter, defineRoutes, lazy, route } from "./router.js";
