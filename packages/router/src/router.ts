/**
 * The router: a route table, the current match as a signal, navigation
 * through the History API, delegated handling of plain anchors, loaders
 * that run before the URL changes, head metadata, and scroll restoration.
 */
import { DIAGNOSTIC_URL, type ReadableSignal, type View, ZerolithError, batch, computed, diagnosticCatalog, each, signal, untracked } from "zerolith";
import { type ParamsOf, type Pattern, build, compile, match } from "./match.js";

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
export type RouteView<Params, Data> = (context: RouteContext<Params, Data>) => unknown;

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

/** Declares one route, inferring its parameters from the path and its data from the loader. */
export function route<const Path extends string, Data = undefined>(definition: RouteDefinition<Path, Data>): RouteDefinition<Path, Data>
{
    return definition;
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
    /** The matched route's name in the route table. */
    readonly name: string;
    /** The path parameters by name, decoded from the URL; empty when the path has none. */
    readonly params: Readonly<Record<string, string>>;
    /** The URL the route matched, query and hash included. */
    readonly url: URL;
    /** What the route's `load` resolved to, or on the initial navigation the copy the server embedded; `undefined` when the route has no loader. */
    readonly data: unknown;
}

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
    fallback?: (url: URL) => unknown;
    /**
     * The head fields every page starts from, as an object or as a function of the URL and the matched route's name, undefined for the fallback.
     * A route's `head` overrides them field by field, and the fallback shows them as they are. Once any route or this option declares a head,
     * the document shows the merged head as a whole on every commit: a field neither gives clears the title or removes the description element.
     */
    head?: Head | ((context: HeadContext) => Head);
    /** Called when a loader, a lazy import, or a route's `head` throws, or when the new page throws as it renders. Without it the error propagates from `navigate()`. */
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

/** A base path with one leading and one trailing slash; an empty or relative base is the root. */
function normalizeBase(base: string | undefined): string
{
    const trimmed = (base ?? "/").trim();
    if (trimmed === "" || trimmed.startsWith("."))
    {
        return "/";
    }
    let start = 0;
    let end = trimmed.length;
    while (start < end && trimmed[start] === "/")
    {
        start++;
    }
    while (end > start && trimmed[end - 1] === "/")
    {
        end--;
    }
    const inner = trimmed.slice(start, end);
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
    /** The name of the route the server rendered; the browser reuses `data` only when its initial navigation matches the same route. */
    readonly name: string;
    /** The path and query of the URL the server rendered; the browser reuses `data` only when its initial URL has the same ones. */
    readonly href: string;
    /** What the route's loader produced on the server, embedded as JSON. */
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

/** The route's own head fields, or none for the fallback or a route without `head`. */
function ownHead(resolved: Resolved): Head
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

/** The head the document shows for a navigation: the defaults, with the route's own fields over them. */
function headOf(resolved: Resolved, target: URL, defaults: RouterOptions["head"]): Head
{
    const merged: Head = { ...(typeof defaults === "function" ? defaults({ url: target, name: resolved.match?.name }) : defaults) };
    const own = ownHead(resolved);
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

/** The error `href()` throws for a name the route table does not hold, built from the core's catalog as the core builds its own. */
function unknownRoute(name: string): ZerolithError
{
    const code = "route_name_unknown";
    const text = diagnosticCatalog[code];
    return new ZerolithError({ code, severity: "error", cause: text?.cause ?? "", fix: text?.fix ?? "", url: `${DIAGNOSTIC_URL}${code}?${new URLSearchParams({ name }).toString()}`, args: { name } });
}

/** A fragment percent-decoded, or as it is when its escapes are malformed, as in `#100%`. */
function decoded(fragment: string): string
{
    try
    {
        return decodeURIComponent(fragment);
    }
    catch
    {
        return fragment;
    }
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
    /** The scroll position the history entry shown saved in its state, if it saved one. */
    const savedScroll = (): number | undefined =>
    {
        const saved: unknown = win?.history.state?.scroll;
        return typeof saved === "number" ? saved : undefined;
    };
    /**
     * The history entry's state as an object the router can add its keys to,
     * keeping what other code on the page stored there; a state that is not
     * an object, such as a string, starts over as an empty one.
     */
    const entryState = (): Record<string, unknown> =>
    {
        const state: unknown = win?.history.state;
        const plain = typeof state === "object" && state !== null && !Array.isArray(state) && [Object.prototype, null].includes(Object.getPrototypeOf(state) as object | null);
        return plain ? { ...(state as Record<string, unknown>) } : {};
    };
    /**
     * Saves the scroll position into the state of the history entry shown.
     * The browser keeps that state with the entry, so the position survives a
     * reload and a later return to the entry, and it goes away with the entry.
     * A browser that limits how often a page changes its history refuses a
     * call now and then, and the next save catches up.
     */
    const saveScroll = (): void =>
    {
        if (win === undefined || options.scroll === false)
        {
            return;
        }
        try
        {
            win.history.replaceState({ ...entryState(), scroll: win.scrollY }, "");
        }
        catch
        {
            return;
        }
    };
    let scrollPause: ReturnType<typeof setTimeout> | undefined;
    /**
     * Saves the position once scrolling pauses: browsers drop history changes
     * made while a page unloads, so a reload finds only what was saved
     * before. No save happens while a navigation is under way, when the entry
     * shown after back or forward may not be the page on screen.
     */
    const onScroll = (): void =>
    {
        clearTimeout(scrollPause);
        scrollPause = setTimeout(() =>
        {
            if (!pending.get())
            {
                saveScroll();
            }
        }, 200);
    };

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

    /** True once any route or the options declare a head; a router with none leaves the document's head alone. */
    const managesHead = options.head !== undefined || compiledRoutes.some((entry) => entry.route.head !== undefined);

    /** Writes the merged head as a whole: the title, empty when it has none, and the description element, removed when it has none. */
    const applyHead = (value: Head): void =>
    {
        if (win === undefined || !managesHead)
        {
            return;
        }
        const doc = win.document;
        doc.title = value.title ?? "";
        let meta = doc.querySelector<HTMLMetaElement>("meta[name=\"description\"]");
        if (value.description === undefined)
        {
            meta?.remove();
            return;
        }
        if (meta === null)
        {
            meta = doc.createElement("meta");
            meta.name = "description";
            doc.head.append(meta);
        }
        meta.content = value.description;
    };

    /** Restores a saved position, or moves to the hash; failing both, to the top unless `top` is false, as on the first navigation, where the browser has placed the page. */
    const scrollTo = (target: URL, restored: number | undefined, top = true): void =>
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
            const element = win.document.getElementById(target.hash.slice(1)) ?? win.document.getElementById(decoded(target.hash.slice(1)));
            if (element !== null)
            {
                element.scrollIntoView();
                return;
            }
        }
        if (top)
        {
            win.scrollTo(0, 0);
        }
    };

    let matchedView: RouteView<unknown, unknown> | undefined;
    /** True once a navigation has committed, so a page is shown that a navigation to its own URL keeps. */
    let committed = false;

    const commit = (target: URL, resolved: Resolved, value: Head, restored: number | undefined, first: boolean): void =>
    {
        matchedView = resolved.view;
        committed = true;
        batch(() =>
        {
            url.set(target);
            current.set(resolved.match);
            head.set(value);
            pending.set(false);
        });
        applyHead(value);
        scrollTo(target, restored, !first);
    };

    /**
     * Runs one navigation: aborts the loader of the one before it, resolves
     * the route and its head before the URL changes, then commits. A failure
     * at any step clears `pending` and ends in an `error` event.
     */
    const go = async (target: URL, mode: "push" | "replace" | "pop", restored?: number, first = false, reload = false): Promise<void> =>
    {
        const run = ++generation;
        controller?.abort();
        controller = undefined;
        const shown = url.get();
        if (committed && !reload && target.pathname === shown.pathname && target.search === shown.search)
        {
            pending.set(false);
            options.observe?.({ type: "start", id: run, url: target, mode });
            if (win !== undefined && mode === "push")
            {
                clearTimeout(scrollPause);
                saveScroll();
                win.history.pushState({}, "", target.href);
            }
            else if (win !== undefined && mode === "replace")
            {
                win.history.replaceState(entryState(), "", target.href);
            }
            url.set(target);
            scrollTo(target, mode === "pop" && target.hash === "" ? restored : undefined);
            options.observe?.({ type: "commit", id: run, url: target, mode, name: current.get()?.name });
            return;
        }
        pending.set(true);
        options.observe?.({ type: "start", id: run, url: target, mode });
        const failed = (error: unknown): void =>
        {
            pending.set(false);
            options.observe?.({ type: "error", id: run, url: target, mode, error });
            if (options.onError === undefined)
            {
                throw error;
            }
            options.onError(error, target);
        };
        let resolved: Resolved;
        let value: Head;
        try
        {
            resolved = await resolve(target);
            value = headOf(resolved, target, options.head);
        }
        catch (error)
        {
            if (run !== generation)
            {
                options.observe?.({ type: "cancel", id: run, url: target, mode });
                return;
            }
            failed(error);
            return;
        }
        if (run !== generation)
        {
            options.observe?.({ type: "cancel", id: run, url: target, mode });
            return;
        }
        try
        {
            if (win !== undefined && mode !== "pop")
            {
                if (mode === "push")
                {
                    clearTimeout(scrollPause);
                    saveScroll();
                    win.history.pushState({}, "", target.href);
                }
                else
                {
                    win.history.replaceState(entryState(), "", target.href);
                }
            }
            commit(target, resolved, value, restored, first);
        }
        catch (error)
        {
            failed(error);
            return;
        }
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
            saveScroll();
            return;
        }
        event.preventDefault();
        void go(target, target.href === win.location.href ? "replace" : "push");
    };

    /**
     * Back and forward, which return to the scroll position the entry saved.
     * Between two entries of the page already shown, which a same-page hash
     * link adds, only the hash changed: the router follows the URL and moves
     * to the hash, or to the entry's position, without loading or rendering
     * the page again.
     */
    const onPopState = (): void =>
    {
        if (win === undefined)
        {
            return;
        }
        clearTimeout(scrollPause);
        const target = new URL(win.location.href);
        const restored = savedScroll();
        const shown = url.get();
        if (!pending.get() && target.pathname === shown.pathname && target.search === shown.search)
        {
            url.set(target);
            scrollTo(target, target.hash === "" ? restored : undefined);
            return;
        }
        void go(target, "pop", restored);
    };

    if (win !== undefined)
    {
        if (options.scroll !== false && "scrollRestoration" in win.history)
        {
            win.history.scrollRestoration = "manual";
        }
        win.document.addEventListener("click", onClick);
        win.addEventListener("popstate", onPopState);
        if (options.scroll !== false)
        {
            win.addEventListener("scroll", onScroll, { passive: true });
        }
    }
    const ready = win === undefined ? Promise.resolve() : go(initial, "replace", savedScroll(), true);

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
                throw unknownRoute(name);
            }
            return bare + build(entry.route.path, (args[0] ?? {}) as Record<string, string>);
        },
        navigate(to, navigation = {})
        {
            const target = toUrl(within(to));
            if (win !== undefined && target.origin !== win.location.origin)
            {
                if (navigation.replace === true)
                {
                    win.location.replace(target.href);
                }
                else
                {
                    win.location.assign(target.href);
                }
                return Promise.resolve();
            }
            return go(target, navigation.replace === true ? "replace" : "push", undefined, false, navigation.reload === true);
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
                win.removeEventListener("scroll", onScroll);
                clearTimeout(scrollPause);
            }
        }
    };
}

