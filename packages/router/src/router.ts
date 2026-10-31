/**
 * The router: a route table, the current match as a signal, navigation
 * through the History API, delegated handling of plain anchors, loaders
 * that run before the URL changes, head metadata, and scroll restoration.
 */
import { type ReadableSignal, type View, batch, computed, each, signal, untracked } from "zerolith";
import { type ParamsOf, type Pattern, build, compile, match } from "./match.js";

/** Document metadata a route contributes. */
export interface Head
{
    title?: string;
    description?: string;
}

/** What a route's `load` receives. */
export interface LoadContext<Params>
{
    params: Params;
    url: URL;
    /** Aborted when a newer navigation starts. */
    abort: AbortSignal;
}

/** What a route's `view` and `head` receive. */
export interface RouteContext<Params, Data>
{
    params: Params;
    data: Data;
    url: URL;
}

/** Renders a route. Called once per navigation to that route. */
export type RouteView<Params, Data> = (context: RouteContext<Params, Data>) => unknown;

/** A view resolved on first navigation, created with `lazy()`. */
export interface LazyView<Params, Data>
{
    readonly lazy: () => Promise<RouteView<Params, Data>>;
}

/** One entry of the route table. Write `load` before `view` so the data type flows into the view. */
export interface RouteDefinition<Path extends string = string, Data = undefined>
{
    path: Path;
    view: RouteView<ParamsOf<Path>, Data> | LazyView<ParamsOf<Path>, Data>;
    load?: (context: LoadContext<ParamsOf<Path>>) => Promise<Data>;
    head?: Head | ((context: RouteContext<ParamsOf<Path>, Data>) => Head);
}

/** Declares one route, inferring its parameters from the path and its data from the loader. */
export function route<const Path extends string, Data = undefined>(definition: RouteDefinition<Path, Data>): RouteDefinition<Path, Data>
{
    return definition;
}

/** The loose shape every route satisfies, used to constrain tables without losing each entry's own types. */
export interface AnyRoute
{
    readonly path: string;
    readonly view: unknown;
    readonly load?: unknown;
    readonly head?: unknown;
}

/** A route table: route names to `route()` definitions. */
export type RouteTable = Readonly<Record<string, AnyRoute>>;

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

/** The route the URL resolved to. */
export interface Match
{
    readonly name: string;
    readonly params: Readonly<Record<string, string>>;
    readonly url: URL;
    readonly data: unknown;
}

/** The arguments `href()` takes for a path: none when it has no parameters. */
export type HrefArgs<Path extends string> = Record<string, never> extends ParamsOf<Path> ? [] : [params: ParamsOf<Path>];

/** What `observe` receives: a navigation starting, committing, or failing, with one id per navigation. */
export interface NavigationEvent
{
    readonly type: "start" | "commit" | "error";
    /** The same number for the start and the end of one navigation. */
    readonly id: number;
    readonly url: URL;
    readonly mode: "push" | "replace" | "pop";
    /** The matched route's name on commit; undefined when the fallback rendered. */
    readonly name?: string | undefined;
    /** The loader's error on failure. */
    readonly error?: unknown;
}

/** Options for `createRouter`. */
export interface RouterOptions
{
    /** Renders when no route matches. */
    fallback?: (url: URL) => unknown;
    /** Called when a loader or a lazy import throws. Without it the error propagates from `navigate()`. */
    onError?: (error: unknown, url: URL) => void;
    /** Set false to leave scrolling to the application. Defaults to true. */
    scroll?: boolean;
    /** The window to attach to. Defaults to the global window; `null` attaches to none, as on the server, even where a window exists. */
    window?: Window | null;
    /** Receives one event when a navigation starts and one when it commits or fails; the hook tracing and logging attach to. */
    observe?: (event: NavigationEvent) => void;
    /**
     * The path the application is served under, such as `"/app/"`, or `import.meta.env.BASE_URL` to follow the build.
     * Route paths are relative to it, `href()` includes it, and links outside it are left to the browser.
     * Defaults to `"/"`; a relative base such as `"./"` counts as `"/"`.
     */
    base?: string;
}

/** A base path with one leading and one trailing slash; an empty or relative base is the root. */
function normalizeBase(base: string | undefined): string
{
    const trimmed = (base ?? "/").trim();
    if (trimmed === "" || trimmed.startsWith("."))
    {
        return "/";
    }
    const inner = trimmed.replace(/^\/+|\/+$/g, "");
    return inner === "" ? "/" : `/${inner}/`;
}

/** The router returned by `createRouter`, typed by its route table. */
export interface Router<T extends RouteTable>
{
    /** The current match, or undefined when nothing matched (the fallback renders). */
    readonly current: ReadableSignal<Match | undefined>;
    /** The current URL. */
    readonly url: ReadableSignal<URL>;
    /** True while a navigation is loading. */
    readonly pending: ReadableSignal<boolean>;
    /** The head metadata of the current route, for the server to render and for the browser to apply. */
    readonly head: ReadableSignal<Head>;
    /** Settles when the initial navigation from the window's location has committed; already settled without a window. Rejects as `navigate` would. */
    readonly ready: Promise<void>;
    /** Builds a URL path for a named route. */
    href<N extends keyof T & string>(name: N, ...args: HrefArgs<T[N]["path"]>): string;
    /** Navigates to a path or URL, running the route's loader first. */
    navigate(to: string, options?: { replace?: boolean }): Promise<void>;
    /** A signal that is true while the URL is at `path` or below it; `exact` requires equality. */
    matches(path: string, options?: { exact?: boolean }): ReadableSignal<boolean>;
    /** Renders the current route, used as `${outlet(router)}`. */
    outlet(): View;
    /** Detaches the router from the window. */
    dispose(): void;
}

interface Compiled
{
    name: string;
    pattern: Pattern;
    route: RouteDefinition<string, unknown>;
    view: RouteView<unknown, unknown> | undefined;
}

interface Resolved
{
    match: Match | undefined;
    view: RouteView<unknown, unknown> | undefined;
    compiled: Compiled | undefined;
}

function isLazy(view: unknown): view is LazyView<unknown, unknown>
{
    return typeof view === "object" && view !== null && "lazy" in view;
}

/** What `renderRouteState` embeds: the route the server rendered, its URL, and the data its loader produced. */
export interface EmbeddedRouteState
{
    readonly name: string;
    readonly href: string;
    readonly data: unknown;
}

/** The selector of the script `renderRouteState` writes. */
export const ROUTE_STATE_SELECTOR: string = "script[type=\"application/json\"][data-zerolith-route]";

/** Reads and removes the embedded route state, if the server left one; used once, for the initial navigation. */
function readEmbeddedState(doc: Document): EmbeddedRouteState | undefined
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
        return typeof parsed.name === "string" && typeof parsed.href === "string" ? { name: parsed.name, href: parsed.href, data: parsed.data } : undefined;
    }
    catch
    {
        return undefined;
    }
}

function headOf(resolved: Resolved): Head
{
    if (resolved.compiled === undefined || resolved.match === undefined)
    {
        return {};
    }
    const { head: declared } = resolved.compiled.route;
    if (declared === undefined)
    {
        return {};
    }
    return typeof declared === "function" ? declared({ params: resolved.match.params, data: resolved.match.data, url: resolved.match.url }) : declared;
}

/** Creates a router over the given table and attaches it to the window when one exists. */
export function createRouter<const T extends RouteTable>(routes: T, options: RouterOptions = {}): Router<T>
{
    const win = options.window === null ? undefined : (options.window ?? (typeof window === "undefined" ? undefined : window));
    let embedded = win === undefined ? undefined : readEmbeddedState(win.document);
    const compiledRoutes: Compiled[] = Object.entries(routes as unknown as Record<string, RouteDefinition<string, unknown>>).map(([name, definition]) => ({
        name,
        pattern: compile(definition.path),
        route: definition,
        view: isLazy(definition.view) ? undefined : (definition.view as RouteView<unknown, unknown>)
    }));
    const byName = new Map(compiledRoutes.map((entry) => [entry.name, entry]));

    const initial = win === undefined ? new URL("http://localhost/") : new URL(win.location.href);
    const url = signal<URL>(initial, { equals: (a, b) => a.href === b.href });
    const current = signal<Match | undefined>(undefined);
    const pending = signal(false);
    const head = signal<Head>({});
    const views = new Map<string, RouteView<unknown, unknown>>();
    let controller: AbortController | undefined;
    let generation = 0;
    const scrollPositions = new Map<string, number>();

    const base = normalizeBase(options.base);
    const bare = base.slice(0, -1);
    /** The path within the application for a URL path, or undefined when it lies outside the base. */
    const local = (pathname: string): string | undefined =>
    {
        if (base === "/")
        {
            return pathname;
        }
        if (pathname === bare)
        {
            return "/";
        }
        return pathname.startsWith(base) ? pathname.slice(bare.length) : undefined;
    };
    /** A root-relative path under the base: one that already starts with it is taken as it is. */
    const within = (path: string): string =>
    {
        if (base === "/" || !path.startsWith("/") || path.startsWith("//") || path === bare || path.startsWith(base))
        {
            return path;
        }
        return bare + path;
    };

    const find = (pathname: string): { compiled: Compiled; params: Record<string, string> } | undefined =>
    {
        const path = local(pathname);
        if (path === undefined)
        {
            return undefined;
        }
        for (const compiled of compiledRoutes)
        {
            const params = match(compiled.pattern, path);
            if (params !== undefined)
            {
                return { compiled, params };
            }
        }
        return undefined;
    };

    const resolve = async (target: URL): Promise<Resolved> =>
    {
        const found = find(target.pathname);
        if (found === undefined)
        {
            return { match: undefined, view: undefined, compiled: undefined };
        }
        const { compiled, params } = found;
        controller?.abort();
        const abort = new AbortController();
        controller = abort;
        let view = compiled.view ?? views.get(compiled.name);
        if (view === undefined)
        {
            view = await (compiled.route.view as LazyView<unknown, unknown>).lazy();
            views.set(compiled.name, view);
        }
        const reusable = embedded;
        embedded = undefined;
        let data: unknown;
        if (reusable !== undefined && reusable.name === compiled.name && reusable.href === target.pathname + target.search)
        {
            data = reusable.data;
        }
        else
        {
            data = compiled.route.load === undefined ? undefined : await compiled.route.load({ params, url: target, abort: abort.signal });
        }
        return { match: { name: compiled.name, params, url: target, data }, view, compiled };
    };

    const applyHead = (value: Head): void =>
    {
        if (win === undefined)
        {
            return;
        }
        const doc = win.document;
        if (value.title !== undefined)
        {
            doc.title = value.title;
        }
        if (value.description !== undefined)
        {
            let meta = doc.querySelector<HTMLMetaElement>("meta[name=\"description\"]");
            if (meta === null)
            {
                meta = doc.createElement("meta");
                meta.name = "description";
                doc.head.append(meta);
            }
            meta.content = value.description;
        }
    };

    const scrollTo = (target: URL, restored: number | undefined): void =>
    {
        if (win === undefined || options.scroll === false)
        {
            return;
        }
        if (restored !== undefined)
        {
            win.scrollTo(0, restored);
            return;
        }
        if (target.hash !== "")
        {
            const element = win.document.getElementById(decodeURIComponent(target.hash.slice(1)));
            if (element !== null)
            {
                element.scrollIntoView();
                return;
            }
        }
        win.scrollTo(0, 0);
    };

    let matchedView: RouteView<unknown, unknown> | undefined;

    const commit = (target: URL, resolved: Resolved, restored: number | undefined): void =>
    {
        matchedView = resolved.view;
        const value = headOf(resolved);
        batch(() =>
        {
            url.set(target);
            current.set(resolved.match);
            head.set(value);
            pending.set(false);
        });
        applyHead(value);
        scrollTo(target, restored);
    };

    const go = async (target: URL, mode: "push" | "replace" | "pop", restored?: number): Promise<void> =>
    {
        const run = ++generation;
        pending.set(true);
        options.observe?.({ type: "start", id: run, url: target, mode });
        let resolved: Resolved;
        try
        {
            resolved = await resolve(target);
        }
        catch (error)
        {
            if (run === generation)
            {
                pending.set(false);
            }
            options.observe?.({ type: "error", id: run, url: target, mode, error });
            if (options.onError === undefined)
            {
                throw error;
            }
            options.onError(error, target);
            return;
        }
        if (run !== generation)
        {
            return;
        }
        if (win !== undefined && mode !== "pop")
        {
            if (mode === "push")
            {
                scrollPositions.set(win.history.state?.key ?? "", win.scrollY);
                win.history.pushState({ key: String(run) }, "", target.href);
            }
            else
            {
                win.history.replaceState({ key: win.history.state?.key ?? String(run) }, "", target.href);
            }
        }
        commit(target, resolved, restored);
        options.observe?.({ type: "commit", id: run, url: target, mode, name: resolved.match?.name });
    };

    const toUrl = (to: string): URL => new URL(to, win === undefined ? "http://localhost/" : win.location.href);

    const onClick = (event: MouseEvent): void =>
    {
        if (win === undefined || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        {
            return;
        }
        const anchor = (event.target as Element | null)?.closest("a[href]");
        if (!(anchor instanceof HTMLAnchorElement))
        {
            return;
        }
        if (anchor.hasAttribute("download") || (anchor.target !== "" && anchor.target !== "_self") || anchor.relList.contains("external"))
        {
            return;
        }
        const target = new URL(anchor.href, win.location.href);
        if (target.origin !== win.location.origin || local(target.pathname) === undefined)
        {
            return;
        }
        if (target.pathname === win.location.pathname && target.search === win.location.search && target.hash !== "")
        {
            return;
        }
        event.preventDefault();
        void go(target, "push");
    };

    const onPopState = (): void =>
    {
        if (win === undefined)
        {
            return;
        }
        const key: string = win.history.state?.key ?? "";
        void go(new URL(win.location.href), "pop", scrollPositions.get(key));
    };

    if (win !== undefined)
    {
        if (options.scroll !== false && "scrollRestoration" in win.history)
        {
            win.history.scrollRestoration = "manual";
        }
        win.document.addEventListener("click", onClick);
        win.addEventListener("popstate", onPopState);
        if (win.history.state?.key === undefined)
        {
            win.history.replaceState({ key: "0" }, "", win.location.href);
        }
    }
    const ready = win === undefined ? Promise.resolve() : go(initial, "replace");

    /**
     * The current page as a list of one entry per committed navigation, so
     * each page renders inside its own owner, as a list row does, and the
     * previous page's effects and cleanups end when the route changes.
     */
    let shown = 0;
    const pages = computed(() =>
    {
        const matched = current.get();
        shown++;
        return [{ id: shown, matched, view: matchedView }];
    });
    const outlet = each(pages, (page) => page.id, (page) => untracked(() =>
    {
        const { matched, view } = page.get();
        if (matched === undefined || view === undefined)
        {
            return options.fallback?.(url.get());
        }
        return view({ params: matched.params, data: matched.data, url: matched.url });
    }));

    return {
        current,
        url,
        pending,
        head,
        ready,
        href(name, ...args)
        {
            const entry = byName.get(name);
            if (entry === undefined)
            {
                return base;
            }
            return bare + build(entry.route.path, (args[0] ?? {}) as Record<string, string>);
        },
        navigate(to, navigation = {})
        {
            return go(toUrl(within(to)), navigation.replace === true ? "replace" : "push");
        },
        matches(path, matching = {})
        {
            const full = within(path);
            return computed(() =>
            {
                const { pathname } = url.get();
                return pathname === full || (matching.exact !== true && pathname.startsWith(full.endsWith("/") ? full : full + "/"));
            });
        },
        outlet()
        {
            return outlet as unknown as View;
        },
        dispose()
        {
            generation++;
            controller?.abort();
            if (win !== undefined)
            {
                win.document.removeEventListener("click", onClick);
                win.removeEventListener("popstate", onPopState);
            }
        }
    };
}

