/**
 * The router: a route table, the current match as a signal, navigation
 * through the History API, delegated handling of plain anchors, loaders
 * that run before the URL changes, head metadata, and scroll restoration.
 * Its parts live under router/: the types in types.ts, route declarations
 * and the router's errors in routes.ts, the embedded state in state.ts,
 * head merging in head.ts, and path helpers in paths.ts.
 */
import { type ReadableSignal, type View, batch, computed, each, signal, untracked } from "zerolith";
import { type Pattern, build, compile, match } from "./match.js";
import { headOf } from "./router/head.js";
import { decoded, normalizeBase, withoutTrailingSlash } from "./router/paths.js";
import { checkPath, isLazy, unknownRoute } from "./router/routes.js";
import { readEmbeddedState } from "./router/state.js";
import type { Head, LazyView, Match, Router, RouterOptions, RouteDefinition, RouteTable, RouteView } from "./router/types.js";

export { defineRoutes, lazy, route } from "./router/routes.js";
export { ROUTE_STATE_SELECTOR } from "./router/state.js";
export type { AnyRoute, DataOf, EmbeddedRouteState, Head, HeadContext, HrefArgs, LazyView, LoadContext, Match, NavigationEvent, RouteContext, RouteDefinition, RouteParams, RouteTable, RouteView, Router, RouterOptions } from "./router/types.js";

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

/** Creates a router over the given table and attaches it to the window when one exists. */
export function createRouter<const T extends RouteTable>(routes: T, options: RouterOptions = {}): Router<T>
{
    const win = options.window === null ? undefined : (options.window ?? (typeof window === "undefined" ? undefined : window));
    let embedded = win === undefined ? undefined : readEmbeddedState(win.document);
    const compiledRoutes: Compiled[] = Object.entries(routes as unknown as Record<string, RouteDefinition<string, unknown>>).map(([name, definition]) => ({
        name,
        pattern: (checkPath(name, definition.path), compile(definition.path)),
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
    /** Where the entry shown stands among the entries the router wrote, kept in each entry's state, so a back or forward that fails can return by the distance it moved. */
    let position = 0;
    let settleReady: { resolve: () => void; reject: (error: unknown) => void } | undefined;
    const ready = new Promise<void>((resolve, reject) =>
    {
        settleReady = { resolve, reject };
    });
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
        const reusable = embedded;
        embedded = undefined;
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

    /** The title and description the document had when the router was created, as written in the page, which a page that gives neither goes back to. */
    const loaded: Head = {};
    if (win !== undefined)
    {
        loaded.title = win.document.title;
        const written = win.document.querySelector<HTMLMetaElement>("meta[name=\"description\"]")?.content;
        if (written !== undefined)
        {
            loaded.description = written;
        }
    }

    /** Writes the merged head as a whole: the title and the description element, each the page's own where the merged head has none. */
    const applyHead = (value: Head): void =>
    {
        if (win === undefined)
        {
            return;
        }
        const doc = win.document;
        doc.title = value.title ?? loaded.title ?? "";
        const description = value.description ?? loaded.description;
        let meta = doc.querySelector<HTMLMetaElement>("meta[name=\"description\"]");
        if (description === undefined)
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
        meta.content = description;
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
    /**
     * The key of the page shown, written into every history entry it owns:
     * the one its navigation wrote, and those a navigation that keeps it
     * adds. Back and forward to an entry with this key keep the page. The
     * document's time origin keeps keys from before a reload apart.
     */
    let pageKey: string | undefined;
    let pageCount = 0;
    const nextPageKey = (): string => `${performance.timeOrigin}:${++pageCount}`;
    /** The commit under way, which records a page view that throws so the commit reports it after the outlet has let go of the page before. */
    let committing: { failed: boolean; error: unknown } | undefined;

    /**
     * Shows the resolved page at `target`. A page view that throws leaves
     * the outlet empty at the new URL, or showing the `failed` view, under
     * the new head, rather than keeping the page before under a URL it does
     * not match, and the commit then throws its error, so the navigation
     * ends in an `error` event.
     */
    const commit = (target: URL, resolved: Resolved, value: Head, restored: number | undefined, first: boolean, key: string): void =>
    {
        matchedView = resolved.view;
        committed = true;
        pageKey = key;
        const attempt = { failed: false, error: undefined as unknown };
        committing = attempt;
        try
        {
            batch(() =>
            {
                url.set(target);
                current.set(resolved.match);
                head.set(value);
                pending.set(false);
            });
        }
        finally
        {
            committing = undefined;
        }
        applyHead(value);
        scrollTo(target, restored, !first);
        if (attempt.failed)
        {
            throw attempt.error;
        }
        settleReady?.resolve();
        settleReady = undefined;
    };

    /**
     * Runs one navigation: aborts the loader of the one before it, resolves
     * the route and its head before the URL changes, then commits. A failure
     * at any step clears `pending` and ends in an `error` event. A navigation
     * to the path and query shown keeps the page, and so does a `shallow` one
     * to the path shown; the entry either adds carries the page's key, so
     * back and forward to it keep the page too.
     */
    const go = async (target: URL, mode: "push" | "replace" | "pop", restored?: number, first = false, reload = false, moved = 0, shallow = false): Promise<void> =>
    {
        const run = ++generation;
        controller?.abort();
        controller = undefined;
        const shown = url.get();
        if (committed && !reload && target.pathname === shown.pathname && (shallow || target.search === shown.search))
        {
            pending.set(false);
            options.observe?.({ type: "start", id: run, url: target, mode });
            if (win !== undefined && mode === "push")
            {
                clearTimeout(scrollPause);
                saveScroll();
                position++;
                win.history.pushState({ position, page: pageKey }, "", target.href);
            }
            else if (win !== undefined && mode === "replace")
            {
                win.history.replaceState({ ...entryState(), position, page: pageKey }, "", target.href);
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
            if (mode === "pop" && moved !== 0 && win !== undefined)
            {
                position -= moved;
                win.history.go(-moved);
            }
            options.observe?.({ type: "error", id: run, url: target, mode, error });
            settleReady?.reject(error);
            settleReady = undefined;
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
            value = headOf(resolved.match, resolved.compiled?.route, target, options.head);
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
        const landed: unknown = mode === "pop" ? win?.history.state?.page : undefined;
        const key = typeof landed === "string" ? landed : nextPageKey();
        try
        {
            if (win !== undefined && mode !== "pop")
            {
                if (mode === "push")
                {
                    clearTimeout(scrollPause);
                    saveScroll();
                    position++;
                    win.history.pushState({ position, page: key }, "", target.href);
                }
                else
                {
                    win.history.replaceState({ ...entryState(), position, page: key }, "", target.href);
                }
            }
            commit(target, resolved, value, restored, first, key);
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
     * the page again. The same holds for an entry of the page shown, by its
     * key, whose query a shallow navigation may have changed.
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
        const landed: unknown = win.history.state?.position;
        const moved = typeof landed === "number" ? landed - position : 0;
        position += moved;
        const shown = url.get();
        const ownEntry = pageKey !== undefined && win.history.state?.page === pageKey;
        if (!pending.get() && target.pathname === shown.pathname && (target.search === shown.search || ownEntry))
        {
            url.set(target);
            scrollTo(target, target.hash === "" ? restored : undefined);
            return;
        }
        void go(target, "pop", restored, false, false, moved);
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
    if (win === undefined)
    {
        settleReady?.resolve();
        settleReady = undefined;
    }
    else
    {
        const state: unknown = win.history.state?.position;
        position = typeof state === "number" ? state : 0;
        void go(initial, "replace", savedScroll(), true).catch(() => undefined);
    }

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
        try
        {
            return view({ params: matched.params, data: matched.data, url: matched.url });
        }
        catch (error)
        {
            if (committing === undefined)
            {
                throw error;
            }
            committing.failed = true;
            committing.error = error;
            return options.failed?.(error, matched.url);
        }
    }));

    return {
        current: current as unknown as ReadableSignal<Match<T> | undefined>,
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
            return go(target, navigation.replace === true ? "replace" : "push", undefined, false, navigation.reload === true, 0, navigation.shallow === true);
        },
        matches(path, matching = {})
        {
            const full = withoutTrailingSlash(within(path.split(/[?#]/)[0] ?? path));
            return computed(() =>
            {
                const pathname = withoutTrailingSlash(url.get().pathname);
                return pathname === full || (matching.exact !== true && pathname.startsWith(full === "/" ? "/" : full + "/"));
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
            pending.set(false);
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

