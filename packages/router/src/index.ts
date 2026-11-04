/**
 * @zerolith/router: typed client-side routing for zerolith.
 */
export type { ParamsOf } from "./match.js";
export type {
    AnyRoute,
    DataOf,
    Head,
    HeadContext,
    HrefArgs,
    LazyView,
    LoadContext,
    Match,
    NavigationEvent,
    RouteContext,
    RouteDefinition,
    RouteParams,
    RouteTable,
    RouteView,
    Router,
    RouterOptions
} from "./router.js";
export type { EmbeddedRouteState } from "./router.js";
export { ROUTE_STATE_SELECTOR } from "./router.js";
export { createRouter, defineRoutes, lazy, route } from "./router.js";
