/**
 * The router's public types: routes and their table, the match a URL
 * resolves to, the options `createRouter` takes, and the router it returns.
 */
import type { ReadableSignal, Renderable, View } from "zerolith";
import type { ParamsOf } from "../match.js";

/** Document metadata a route contributes. */
export interface Head
{
    /** The document title, set as `document.title` in the browser and rendered as `<title>` by `renderHead`; `undefined` leaves the title as it is. */
    title?: string;
    /** The page description, the content of `<meta name="description">`; `undefined` leaves it as it is. In the browser the router adds that element when the document lacks one. */
    description?: string;
}

/** What a route's `load` receives. */
export interface LoadContext<Params>
{
    /** The path parameters by name, decoded from the URL. */
    params: Params;
    /** The URL being navigated to, query and hash included; the router's `url` changes to it only when the navigation commits. */
    url: URL;
    /** Aborted when a newer navigation starts. */
    abort: AbortSignal;
}

/** What a route's `view` and `head` receive. */
export interface RouteContext<Params, Data>
{
    /** The path parameters by name, decoded from the URL. */
    params: Params;
    /** What the route's `load` resolved to, or on the initial navigation the copy the server embedded; `undefined` when the route has no loader. */
    data: Data;
    /** The URL the route matched, query and hash included. */
    url: URL;
}

/** Renders a route. Called once per navigation to that route. */
export type RouteView<Params, Data> = (context: RouteContext<Params, Data>) => Renderable;

/** A view resolved on first navigation, created with `lazy()`. */
export interface LazyView<Params, Data>
{
    /** Imports the view; the router calls it on the first navigation to the route and keeps the view it resolves. */
    readonly lazy: () => Promise<RouteView<Params, Data>>;
}

/** One entry of the route table. Write `load` before `view` so the data type flows into the view. */
export interface RouteDefinition<Path extends string = string, Data = undefined>
{
    /** The path pattern, relative to the router's `base`: static segments, `:name` parameters, and an optional trailing `*rest` that captures the remainder. */
    path: Path;
    /** Renders the route: a view function, or a `lazy()` view imported on first navigation. */
    view: RouteView<ParamsOf<Path>, Data> | LazyView<ParamsOf<Path>, Data>;
    /** Resolves the data `view` and `head` receive, before the URL changes; the initial navigation skips it when the server embedded data for the same route, path, and query. */
    load?: (context: LoadContext<ParamsOf<Path>>) => Promise<Data>;
    /** The route's document metadata: an object, or a function that receives the route context once `load` resolves. */
    head?: Head | ((context: RouteContext<ParamsOf<Path>, Data>) => Head);
}

/** The loose shape every route satisfies, used to constrain tables without losing each entry's own types. */
export interface AnyRoute
{
    /** The route's path pattern; `href()` takes the types of its parameters from it. */
    readonly path: string;
    /** The route's view function or `lazy()` view. */
    readonly view: unknown;
    /** The route's loader, when it has one. */
    readonly load?: unknown;
    /** The route's document metadata or the function that computes it, when it has one. */
    readonly head?: unknown;
}

/** A route table: route names to `route()` definitions. */
export type RouteTable = Readonly<Record<string, AnyRoute>>;

/** What a route's `load` resolves to: `undefined` for a route without a loader, and `unknown` for a table whose routes are not known statically. */
export type DataOf<R> = R extends RouteDefinition<infer _Path, infer Data> ? Data : unknown;

/** The parameters a route's path names, or any string record for a table whose routes are not known statically. */
export type RouteParams<R> = R extends RouteDefinition<infer Path, infer _Data> ? (string extends Path ? Readonly<Record<string, string>> : ParamsOf<Path>) : Readonly<Record<string, string>>;

/** The route the URL resolved to. For a typed table it is a union over the table's names, each with the parameters its path names and the data its loader resolves to, so a check of `name` narrows `params` and `data`. */
export type Match<T extends RouteTable = RouteTable> = T extends RouteTable ? {
    [N in keyof T]: {
        /** The matched route's name in the route table. */
        readonly name: N & string;
        /** The path parameters by name, decoded from the URL; empty when the path has none. */
        readonly params: RouteParams<T[N]>;
        /** The URL the route matched, query and hash included. */
        readonly url: URL;
        /** What the route's `load` resolved to, or on the initial navigation the copy the server embedded; `undefined` when the route has no loader. */
        readonly data: DataOf<T[N]>;
    };
}[keyof T] : never;

/** The arguments `href()` takes for a path: none when it has no parameters. */
export type HrefArgs<Path extends string> = Record<string, never> extends ParamsOf<Path> ? [] : [params: ParamsOf<Path>];

/**
 * What `observe` receives: a navigation starting, then committing, failing,
 * or canceled because a newer navigation started before it committed or the
 * router was disposed, with one id per navigation.
 */
export interface NavigationEvent
{
    /** The stage: `start` when the navigation begins, then one of `commit`, `error`, or `cancel` when it ends. */
    readonly type: "start" | "commit" | "error" | "cancel";
    /** The same number for the start and the end of one navigation. */
    readonly id: number;
    /** The URL being navigated to. */
    readonly url: URL;
    /** How the navigation arrived: `push` adds a history entry, `replace` overwrites the current one, as the initial navigation does, and `pop` follows back or forward in the browser. */
    readonly mode: "push" | "replace" | "pop";
    /** The matched route's name on commit; undefined when the fallback rendered. */
    readonly name?: string | undefined;
    /** The loader's error on failure. */
    readonly error?: unknown;
}

/** What the router's `head` option receives when it is a function. */
export interface HeadContext
{
    /** The URL being navigated to. */
    url: URL;
    /** The matched route's name, or undefined for the fallback. */
    name: string | undefined;
}

/** Options for `createRouter`. */
export interface RouterOptions
{
    /** Renders when no route matches. */
    fallback?: (url: URL) => Renderable;
    /**
     * The head fields every page starts from, as an object or as a function of the URL and the matched route's name, undefined for the fallback.
     * A route's `head` overrides them field by field, and the fallback shows them as they are. On every commit the document shows the merged
     * head as a whole; a field neither gives goes back to what the document had when the router was created, as written in the page.
     */
    head?: Head | ((context: HeadContext) => Head);
    /** Called when a loader, a lazy import, or a route's `head` throws, which leaves the page as it was, or when the new page throws as it renders, after the URL changed. Without it the error propagates from `navigate()`, and a navigation a link or the history started rejects unobserved, which the browser reports. */
    onError?: (error: unknown, url: URL) => void;
    /** Set false to leave scrolling to the application. Defaults to true. */
    scroll?: boolean;
    /** The window to attach to. Defaults to the global window; `null` attaches to none, as on the server, even where a window exists. */
    window?: Window | null;
    /** Receives one event when a navigation starts and one when it commits, fails, or is canceled by a newer navigation or by `dispose()`; the hook tracing and logging attach to. */
    observe?: (event: NavigationEvent) => void;
    /**
     * The path the application is served under, such as `"/app/"`, or `import.meta.env.BASE_URL` to follow the build.
     * Route paths are relative to it, `href()` includes it, and links outside it are left to the browser.
     * Defaults to `"/"`; a relative base such as `"./"` counts as `"/"`.
     */
    base?: string;
}

/** The router returned by `createRouter`, typed by its route table. */
export interface Router<T extends RouteTable>
{
    /** The current match, or undefined when nothing matched (the fallback renders). */
    readonly current: ReadableSignal<Match<T> | undefined>;
    /** The current URL. */
    readonly url: ReadableSignal<URL>;
    /** True while a navigation is loading. */
    readonly pending: ReadableSignal<boolean>;
    /** The head metadata of the current route, for the server to render and for the browser to apply. */
    readonly head: ReadableSignal<Head>;
    /** Settles when the first navigation commits, the initial one from the window's location or a newer one that replaced it; already settled without a window. Rejects with the first failure before that, as `navigate` would. */
    readonly ready: Promise<void>;
    /** Builds a URL path for a named route; a name the table does not hold throws `route_name_unknown`. */
    href<N extends keyof T & string>(name: N, ...args: HrefArgs<T[N]["path"]>): string;
    /**
     * Navigates to a path or URL, running the route's loader first. The URL of the page shown keeps the page, unless `reload` asks for the
     * loader to run and the page to render again, as after a form's redirect back to the page. A URL on another origin is left to the
     * browser, through `location.assign`, or `location.replace` with `replace`.
     */
    navigate(to: string, options?: { replace?: boolean; reload?: boolean }): Promise<void>;
    /** A signal that is true while the URL is at `path` or below it; `exact` requires equality. */
    matches(path: string, options?: { exact?: boolean }): ReadableSignal<boolean>;
    /** Renders the current route, used as `${router.outlet()}`. */
    outlet(): View;
    /** Detaches the router from the window. */
    dispose(): void;
}

/** What `renderRouteState` embeds: the route the server rendered, its URL, and the data its loader produced. */
export interface EmbeddedRouteState
{
    /** The name of the route the server rendered; the browser reuses `data` only when its initial navigation matches the same route. */
    readonly name: string;
    /** The path and query of the URL the server rendered; the browser reuses `data` only when its initial URL has the same ones. */
    readonly href: string;
    /** What the route's loader produced on the server, embedded as JSON. */
    readonly data: unknown;
}
