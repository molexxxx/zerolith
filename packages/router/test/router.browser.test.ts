import { afterEach, describe, expect, it, vi } from "vitest";
import { type Renderable, type Root, type View, ZerolithError, effect, html, onDispose, render, signal } from "zerolith";
import { type RouteTable, type Router, createRouter, defineRoutes, lazy, route } from "@zerolith/router";

let root: Root | undefined;
let host: HTMLElement | undefined;
let router: Router<RouteTable> | undefined;

/** Waits until `condition` holds, polling, for up to a second. */
async function until(condition: () => boolean): Promise<void>
{
    for (let i = 0; i < 100 && !condition(); i++)
    {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(condition()).toBe(true);
}

function mount(view: Renderable | (() => Renderable)): HTMLElement
{
    host = document.createElement("div");
    document.body.append(host);
    root = render(view, host);
    return host;
}

async function settled(current: Router<RouteTable>): Promise<void>
{
    await vi.waitFor(() =>
    {
        expect(current.pending.get()).toBe(false);
    });
}

afterEach(() =>
{
    router?.dispose();
    router = undefined;
    root?.dispose();
    root = undefined;
    host?.remove();
    host = undefined;
    history.replaceState(null, "", "/");
});

const releases = [{ tag: "v1", name: "One" }, { tag: "v2", name: "Two" }];

function table()
{
    return defineRoutes({
        home: route({
            path: "/",
            view: () => html`<h1>Home</h1>`,
            head: { title: "Home title", description: "Home description" }
        }),
        release: route({
            path: "/releases/:tag",
            load: ({ params }) => Promise.resolve(releases.find((release) => release.tag === params.tag)),
            view: ({ params, data }) => html`<h1>Release ${params.tag}: ${data?.name ?? "missing"}</h1>`,
            head: ({ data }) => ({ title: data?.name ?? "Missing" })
        }),
        docs: route({
            path: "/docs/*path",
            view: lazy(() => Promise.resolve(({ params }: { params: { path: string } }) => html`<h1>Docs ${params.path}</h1>`))
        })
    });
}

describe("router", () =>
{
    it("types hrefs from the route table", () =>
    {
        router = createRouter(table(), { window });
        const typed = router as unknown as Router<ReturnType<typeof table>>;
        expect(typed.href("home")).toBe("/");
        expect(typed.href("release", { tag: "v1 beta" })).toBe("/releases/v1%20beta");
        expect(typed.href("docs", { path: "a/b" })).toBe("/docs/a/b");
        // @ts-expect-error a parameter is required
        typed.href("release");
        let thrown: unknown;
        try
        {
            // @ts-expect-error the route does not exist
            typed.href("nope");
        }
        catch (error)
        {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(ZerolithError);
        const { diagnostic } = thrown as ZerolithError;
        expect(diagnostic.code).toBe("route_name_unknown");
        expect(diagnostic.args).toEqual({ name: "nope" });
        expect(diagnostic.url).toBe("https://zerolith.dev/e/route_name_unknown/?name=nope");
        expect(diagnostic.cause).toContain("href()");
    });

    it("applies the head as a whole on every commit: the router's defaults under a route's fields, and the page's own where neither gives one", async () =>
    {
        history.replaceState(null, "", "/");
        document.title = "Before";
        document.querySelector("meta[name=\"description\"]")?.remove();
        router = createRouter(table(), { window, head: { title: "Site", description: "Site description" }, fallback: () => html`<p>missing</p>` });
        await settled(router);
        mount(html`<main>${router.outlet()}</main>`);
        expect(document.title).toBe("Home title");
        expect(document.querySelector<HTMLMetaElement>("meta[name=\"description\"]")?.content).toBe("Home description");
        expect(router.head.get()).toEqual({ title: "Home title", description: "Home description" });

        await router.navigate("/releases/v2");
        expect(document.title).toBe("Two");
        expect(document.querySelector<HTMLMetaElement>("meta[name=\"description\"]")?.content).toBe("Site description");

        await router.navigate("/docs/a");
        expect(document.title).toBe("Site");
        await router.navigate("/missing");
        expect(document.title).toBe("Site");
        expect(router.head.get()).toEqual({ title: "Site", description: "Site description" });
        router.dispose();

        history.replaceState(null, "", "/");
        document.querySelector("meta[name=\"description\"]")?.remove();
        router = createRouter(table(), { window, head: ({ name, url }) => ({ title: name === undefined ? `Not found ${url.pathname}` : "App" }), fallback: () => html`<p>missing</p>` });
        await settled(router);
        await router.navigate("/missing");
        expect(document.title).toBe("Not found /missing");
        expect(document.querySelector("meta[name=\"description\"]")).toBeNull();
        await router.navigate("/docs/a");
        expect(document.title).toBe("App");
        router.dispose();

        history.replaceState(null, "", "/");
        document.title = "Page";
        const own = document.createElement("meta");
        own.name = "description";
        own.content = "Page description";
        document.head.append(own);
        router = createRouter(table(), { window, fallback: () => html`<p>missing</p>` });
        await settled(router);
        expect(document.querySelector<HTMLMetaElement>("meta[name=\"description\"]")?.content).toBe("Home description");
        await router.navigate("/releases/v1");
        expect(document.title).toBe("One");
        expect(document.querySelector<HTMLMetaElement>("meta[name=\"description\"]")?.content).toBe("Page description");
        await router.navigate("/docs/a");
        expect(document.title).toBe("Page");
        await router.navigate("/missing");
        expect(document.title).toBe("Page");
        expect(document.querySelector<HTMLMetaElement>("meta[name=\"description\"]")?.content).toBe("Page description");
        router.dispose();
        own.remove();

        history.replaceState(null, "", "/");
        document.title = "Kept";
        router = createRouter(defineRoutes({ home: route({ path: "/", view: () => html`<h1>Home</h1>` }), other: route({ path: "/other", view: () => html`<h1>Other</h1>` }) }), { window });
        await settled(router);
        await router.navigate("/other");
        expect(document.title).toBe("Kept");
        expect(document.querySelector("meta[name=\"description\"]")).toBeNull();
    });

    it("keeps the page and its focused field through a shallow navigation that changes the query, and through back and forward between such entries", async () =>
    {
        history.replaceState(null, "", "/");
        let loads = 0;
        let builds = 0;
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<h1>Home</h1>` }),
            releases: route({
                path: "/releases",
                load: () => Promise.resolve(++loads),
                view: (): View =>
                {
                    builds++;
                    return html`<label>Search <input id="search"></label>`;
                }
            })
        });
        router = createRouter(pages, { window });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);
        await router.navigate("/releases");
        const field = el.querySelector<HTMLInputElement>("#search");
        field?.focus();
        await router.navigate("/releases?q=draft", { shallow: true });
        history.back();
        await until(() => router?.url.get().search === "");
        expect(el.querySelector("#search")).toBe(field);
        const entries = history.length;

        await router.navigate("/releases?q=photo", { replace: true, shallow: true });
        expect(el.querySelector("#search")).toBe(field);
        expect(document.activeElement).toBe(field);
        expect(router.url.get().search).toBe("?q=photo");
        expect(location.search).toBe("?q=photo");
        expect(history.length).toBe(entries);
        expect([loads, builds]).toEqual([1, 1]);

        await router.navigate("/releases?q=photos", { shallow: true });
        expect(el.querySelector("#search")).toBe(field);
        history.back();
        await until(() => router?.url.get().search === "?q=photo");
        expect(el.querySelector("#search")).toBe(field);
        history.forward();
        await until(() => router?.url.get().search === "?q=photos");
        expect(el.querySelector("#search")).toBe(field);
        expect(document.activeElement).toBe(field);
        expect([loads, builds]).toEqual([1, 1]);

        await router.navigate("/releases?q=maps");
        expect([loads, builds]).toEqual([2, 2]);
        expect(el.querySelector("#search")).not.toBe(field);
        history.back();
        await until(() => router?.url.get().search === "?q=photos");
        expect([loads, builds]).toEqual([3, 3]);
        const loaded = el.querySelector("#search");
        history.back();
        await until(() => router?.url.get().search === "?q=photo");
        expect(el.querySelector("#search")).toBe(loaded);
        expect([loads, builds]).toEqual([3, 3]);

        await router.navigate("/", { shallow: true });
        expect(el.textContent).toBe("Home");
    });

    it("keeps the page shown when a link or navigate() names its URL, following the link in the history and the scroll", async () =>
    {
        history.replaceState(null, "", "/");
        const events: string[] = [];
        let loads = 0;
        let views = 0;
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<h1>Home</h1>` }),
            guide: route({
                path: "/guide",
                load: () => Promise.resolve(++loads),
                view: ({ data }) => html`<h1 id="guide">Guide ${data}</h1><details open><summary>Part</summary><p>Inside</p></details><p id="part" style="margin-top: 3000px">Deep</p>`
            }),
            slow: route({ path: "/slow", load: () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 50)), view: ({ data }) => html`<p>${data}</p>` })
        });
        router = createRouter(pages, { window, observe: (event) => events.push(`${event.type} ${event.url.pathname}${event.url.search}${event.url.hash}${event.name === undefined ? "" : ` ${event.name}`}`) });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}<a id="same" href="/guide">guide</a><a id="deep" href="/guide#part">deep</a></main>`);
        await router.navigate("/guide");
        const heading = el.querySelector("#guide");
        el.querySelector("details")?.removeAttribute("open");
        views++;
        const entries = history.length;
        window.scrollTo(0, 500);
        events.length = 0;

        await router.navigate("/guide");
        expect(loads).toBe(1);
        expect(el.querySelector("#guide")).toBe(heading);
        expect(el.querySelector("details")?.hasAttribute("open")).toBe(false);
        expect(history.length).toBe(entries + 1);
        expect(window.scrollY).toBe(0);
        expect(events).toEqual(["start /guide", "commit /guide guide"]);

        el.querySelector("#same")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await settled(router);
        expect(loads).toBe(1);
        expect(el.querySelector("#guide")).toBe(heading);
        expect(history.length).toBe(entries + 1);

        el.querySelector("#deep")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(location.hash).toBe("#part"));
        expect(loads).toBe(1);
        expect(el.querySelector("#guide")).toBe(heading);

        await router.navigate("/guide?x=1");
        expect(loads).toBe(2);
        expect(el.querySelector("#guide")).not.toBe(heading);
        expect(views).toBe(1);

        const second = el.querySelector("#guide");
        await router.navigate("/guide?x=1", { reload: true });
        expect(loads).toBe(3);
        expect(el.querySelector("#guide")).not.toBe(second);
        expect(el.querySelector("#guide")?.textContent).toBe("Guide 3");
        await router.navigate("/guide?x=1");
        expect(loads).toBe(3);

        const replaced = router.navigate("/slow");
        await router.navigate("/guide?x=1");
        await replaced;
        expect(loads).toBe(3);
        expect(router.pending.get()).toBe(false);
        expect(el.querySelector("#guide")?.textContent).toBe("Guide 3");
        expect(events.slice(-4)).toEqual(["start /slow", "start /guide?x=1", "commit /guide?x=1 guide", "cancel /slow"]);
    });

    it("renders the matched route through the outlet, loads data first, and sets the head", async () =>
    {
        history.replaceState(null, "", "/");
        router = createRouter(table(), { window, fallback: (url) => html`<h1>Not found ${url.pathname}</h1>` });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);
        expect(el.textContent).toBe("Home");
        expect(document.title).toBe("Home title");
        expect(document.querySelector<HTMLMetaElement>("meta[name=\"description\"]")?.content).toBe("Home description");

        await router.navigate("/releases/v2");
        expect(location.pathname).toBe("/releases/v2");
        expect(el.textContent).toBe("Release v2: Two");
        expect(document.title).toBe("Two");

        await router.navigate("/docs/guide/intro");
        expect(el.textContent).toBe("Docs guide/intro");

        await router.navigate("/missing");
        expect(router.current.get()).toBeUndefined();
        expect(el.textContent).toBe("Not found /missing");
    });

    it("handles plain anchors and leaves external, modified, and download links alone", async () =>
    {
        history.replaceState(null, "", "/");
        router = createRouter(table(), { window });
        await settled(router);
        const el = mount(html`
            <main>
                ${router.outlet()}
                <a id="internal" href="/releases/v1">one</a>
                <a id="download" href="/releases/v2" download>two</a>
                <a id="external" href="https://example.com/x">x</a>
            </main>`);
        const prevented = (id: string, init: MouseEventInit = {}): boolean =>
        {
            let byRouter = false;
            document.addEventListener("click", (event) =>
            {
                byRouter = event.defaultPrevented;
                event.preventDefault();
            }, { once: true });
            const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
            el.querySelector(`#${id}`)?.dispatchEvent(event);
            return byRouter;
        };
        expect(prevented("external")).toBe(false);
        expect(prevented("download")).toBe(false);
        expect(prevented("internal", { ctrlKey: true })).toBe(false);
        expect(prevented("internal")).toBe(true);
        await settled(router);
        expect(location.pathname).toBe("/releases/v1");
        expect(el.querySelector("h1")?.textContent).toBe("Release v1: One");
    });

    it("serves under a base path and leaves links outside it to the browser", async () =>
    {
        history.replaceState(null, "", "/app/");
        const app = createRouter(table(), { window, base: "/app/" });
        router = app;
        await settled(app);
        const releaseHref = app.href("release", { tag: "v1" });
        expect(releaseHref).toBe("/app/releases/v1");
        const el = mount(html`
            <main>
                ${app.outlet()}
                <a id="inside" href=${releaseHref}>one</a>
                <a id="outside" href="/elsewhere">elsewhere</a>
            </main>`);
        expect(el.querySelector("h1")?.textContent).toBe("Home");
        let byRouter = false;
        document.addEventListener("click", (event) =>
        {
            byRouter = event.defaultPrevented;
            event.preventDefault();
        }, { once: true });
        el.querySelector("#outside")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        expect(byRouter).toBe(false);
        el.querySelector("#inside")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(el.querySelector("h1")?.textContent).toBe("Release v1: One"));
        expect(location.pathname).toBe("/app/releases/v1");
        await app.navigate("/releases/v2");
        expect(location.pathname).toBe("/app/releases/v2");
        expect(app.matches("/releases").get()).toBe(true);
        history.back();
        await vi.waitFor(() => expect(location.pathname).toBe("/app/releases/v1"));
        await vi.waitFor(() => expect(el.querySelector("h1")?.textContent).toBe("Release v1: One"));
    });

    it("exposes matches() as a signal and follows history navigation", async () =>
    {
        history.replaceState(null, "", "/");
        router = createRouter(table(), { window });
        await settled(router);
        const active = router.matches("/releases");
        const seen: boolean[] = [];
        effect(() =>
        {
            seen.push(active.get());
        });
        await router.navigate("/releases/v1");
        expect(seen).toEqual([false, true]);
        expect(router.matches("/releases", { exact: true }).get()).toBe(false);

        const back = new Promise<void>((resolve) =>
        {
            const stop = effect(() =>
            {
                if (router?.url.get().pathname === "/")
                {
                    stop();
                    resolve();
                }
            });
        });
        history.back();
        await back;
        expect(seen).toEqual([false, true, false]);
    });

    it("keeps each entry's scroll position in its history state, so back and a reload return to it", async () =>
    {
        history.replaceState(null, "", "/");
        const tall = document.createElement("div");
        tall.style.height = "6000px";
        document.body.append(tall);
        try
        {
            const pages = defineRoutes({
                home: route({ path: "/", view: () => html`<h1>Home</h1>` }),
                other: route({ path: "/other", view: () => html`<h1>Other</h1>` })
            });
            router = createRouter(pages, { window });
            await settled(router);
            mount(html`<main>${router.outlet()}</main>`);
            window.scrollTo(0, 1200);
            await router.navigate("/other");
            expect(window.scrollY).toBe(0);
            history.back();
            await vi.waitFor(() => expect(location.pathname).toBe("/"));
            await vi.waitFor(() => expect(window.scrollY).toBe(1200));

            window.scrollTo(0, 700);
            await vi.waitFor(() => expect(history.state?.scroll).toBe(700));
            router.dispose();
            window.scrollTo(0, 0);
            router = createRouter(pages, { window });
            await settled(router);
            expect(window.scrollY).toBe(700);
        }
        finally
        {
            tall.remove();
        }
    });

    it("keeps an object state other code stored in the entry and replaces one that is not an object", async () =>
    {
        history.replaceState("set by another script", "", "/");
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<h1>Home</h1>` })
        });
        router = createRouter(pages, { window });
        await settled(router);
        await vi.waitFor(() => expect(typeof history.state).toBe("object"));
        expect(Object.keys(history.state as object).some((key) => /^\d+$/.test(key))).toBe(false);
        router.dispose();
        history.replaceState({ owner: "another script" }, "", "/");
        router = createRouter(pages, { window });
        await settled(router);
        expect((history.state as { owner?: string }).owner).toBe("another script");
    });

    it("follows back and forward between hash entries of the page shown without loading it again", async () =>
    {
        history.replaceState(null, "", "/");
        let loads = 0;
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<h1>Home</h1>` }),
            guide: route({
                path: "/guide",
                load: () =>
                {
                    loads++;
                    return Promise.resolve(loads);
                },
                view: ({ data }) => html`<h1>Guide ${data}</h1><h2 id="part">Part</h2>`
            })
        });
        router = createRouter(pages, { window });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);
        await router.navigate("/guide");
        expect(loads).toBe(1);
        history.pushState(null, "", "/guide#part");
        history.back();
        await vi.waitFor(() => expect(location.hash).toBe(""));
        history.forward();
        await vi.waitFor(() => expect(location.hash).toBe("#part"));
        await vi.waitFor(() => expect(router?.url.get().hash).toBe("#part"));
        history.back();
        await vi.waitFor(() => expect(router?.url.get().hash).toBe(""));
        expect(loads).toBe(1);
        expect(el.querySelector("h1")?.textContent).toBe("Guide 1");
    });

    it("gives each page an owner that ends when the route changes", async () =>
    {
        history.replaceState(null, "", "/");
        const ticks = signal(0);
        const runs: string[] = [];
        const disposed: string[] = [];
        const owned = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            clock: route({
                path: "/clock/:id",
                view: ({ params }) =>
                {
                    effect(() =>
                    {
                        runs.push(`${params.id}:${ticks.get()}`);
                    });
                    onDispose(() => disposed.push(params.id));
                    return html`<p>clock ${params.id}</p>`;
                }
            })
        });
        router = createRouter(owned, { window });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);

        await router.navigate("/clock/a");
        expect(el.textContent).toBe("clock a");
        ticks.set(1);
        expect(runs).toEqual(["a:0", "a:1"]);

        await router.navigate("/clock/b");
        expect(el.textContent).toBe("clock b");
        expect(disposed).toEqual(["a"]);

        await router.navigate("/");
        expect(el.textContent).toBe("home");
        expect(disposed).toEqual(["a", "b"]);
        ticks.set(2);
        expect(runs).toEqual(["a:0", "a:1", "b:1"]);
    });

    it("reports loader errors through onError and ignores stale navigations", async () =>
    {
        history.replaceState(null, "", "/");
        const onError = vi.fn();
        const slow = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            fail: route({
                path: "/fail",
                load: () => Promise.reject(new Error("nope")),
                view: () => html`<p>never</p>`
            }),
            slow: route({
                path: "/slow",
                load: () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 30)),
                view: ({ data }) => html`<p>${data}</p>`
            })
        });
        router = createRouter(slow, { window, onError });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);
        await router.navigate("/fail");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(location.pathname).toBe("/");
        expect(el.textContent).toBe("home");

        const slowNavigation = router.navigate("/slow");
        await router.navigate("/");
        await slowNavigation;
        expect(location.pathname).toBe("/");
        expect(el.textContent).toBe("home");
    });

    it("shows no page at the new URL and reports the error when the view navigated to throws", async () =>
    {
        history.replaceState(null, "", "/");
        const onError = vi.fn();
        const events: string[] = [];
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            broken: route({
                path: "/broken",
                head: { title: "Broken" },
                view: (): View =>
                {
                    throw new Error("view");
                }
            })
        });
        router = createRouter(pages, { window, onError, observe: (event) => events.push(`${event.type} ${event.url.pathname}`) });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);

        await router.navigate("/broken");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]?.[0]).toEqual(new Error("view"));
        expect(location.pathname).toBe("/broken");
        expect(router.current.get()?.name).toBe("broken");
        expect(document.title).toBe("Broken");
        expect(el.textContent).toBe("");
        expect(events.slice(-2)).toEqual(["start /broken", "error /broken"]);

        await router.navigate("/");
        expect(el.textContent).toBe("home");
        expect(onError).toHaveBeenCalledTimes(1);
    });

    it("shows the failed view in the outlet, given the error and the URL, when the view navigated to throws", async () =>
    {
        history.replaceState(null, "", "/");
        const onError = vi.fn();
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            broken: route({
                path: "/broken/:id",
                view: (): View =>
                {
                    throw new Error("view");
                }
            })
        });
        router = createRouter(pages, {
            window,
            onError,
            failed: (error, url) => html`<p role="alert">${(error as Error).message} at ${url.pathname}</p>`
        });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);

        await router.navigate("/broken/7");
        expect(el.textContent).toBe("view at /broken/7");
        expect(location.pathname).toBe("/broken/7");
        expect(onError).toHaveBeenCalledTimes(1);

        await router.navigate("/");
        expect(el.textContent).toBe("home");
    });

    it("throws a view's error from the mount that renders the outlet when no navigation is running", async () =>
    {
        history.replaceState(null, "", "/");
        let fail = false;
        const pages = defineRoutes({
            home: route({
                path: "/",
                view: (): View =>
                {
                    if (fail)
                    {
                        throw new Error("view");
                    }
                    return html`<p>home</p>`;
                }
            })
        });
        router = createRouter(pages, { window, onError: () => undefined });
        await settled(router);
        fail = true;
        expect(() => mount(html`<main>${router?.outlet()}</main>`)).toThrow("view");
    });

    it("fails a navigation whose head throws before the URL changes, and leaves another origin to the browser", async () =>
    {
        history.replaceState(null, "", "/");
        const onError = vi.fn();
        const events: string[] = [];
        const load = vi.fn(() => Promise.resolve(null));
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            record: route({
                path: "/records/:id",
                load,
                view: () => html`<p>record</p>`,
                head: (): { title: string } =>
                {
                    throw new Error("head");
                }
            })
        });
        const assigned: string[] = [];
        const fakeLocation = new Proxy({}, {
            get: (_target, key) => key === "assign" ? (href: string) => assigned.push(href) : Reflect.get(window.location, key) as unknown
        });
        const fakeWindow = new Proxy(window, {
            get: (target, key) =>
            {
                if (key === "location")
                {
                    return fakeLocation;
                }
                const value = Reflect.get(target, key) as unknown;
                return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
            }
        });
        router = createRouter(pages, { window: fakeWindow, onError, observe: (event) => events.push(`${event.type} ${event.url.pathname}`) });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);

        await router.navigate("/records/7");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(router.pending.get()).toBe(false);
        expect(location.pathname).toBe("/");
        expect(el.textContent).toBe("home");
        expect(events.slice(-2)).toEqual(["start /records/7", "error /records/7"]);

        load.mockClear();
        await router.navigate("https://example.com/records/8");
        expect(assigned).toEqual(["https://example.com/records/8"]);
        expect(load).not.toHaveBeenCalled();
        expect(router.pending.get()).toBe(false);
    });

    it("aborts the loader of a navigation that one to an unmatched path replaces", async () =>
    {
        history.replaceState(null, "", "/");
        const events: string[] = [];
        let aborted = false;
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            hanging: route({
                path: "/hanging",
                load: ({ abort }) => new Promise<string>((_resolve, reject) =>
                {
                    abort.addEventListener("abort", () =>
                    {
                        aborted = true;
                        reject(new DOMException("The navigation was replaced.", "AbortError"));
                    });
                }),
                view: ({ data }) => html`<p>${data}</p>`
            })
        });
        router = createRouter(pages, { window, fallback: () => html`<p>missing</p>`, observe: (event) => events.push(`${event.type} ${event.url.pathname}`) });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);
        events.length = 0;

        const hanging = router.navigate("/hanging");
        await router.navigate("/nowhere");
        await hanging;
        expect(aborted).toBe(true);
        expect(events).toEqual(expect.arrayContaining(["cancel /hanging", "commit /nowhere"]));
        expect(el.textContent).toBe("missing");
    });

    it("leaves the scroll position alone on the first navigation of a fresh visit", async () =>
    {
        history.replaceState(null, "", "/");
        const tall = document.createElement("div");
        tall.style.height = "6000px";
        document.body.append(tall);
        try
        {
            window.scrollTo(0, 900);
            const pages = defineRoutes({
                home: route({
                    path: "/",
                    load: () => new Promise<string>((resolve) => setTimeout(() => resolve("ready"), 20)),
                    view: ({ data }) => html`<h1>${data}</h1>`
                })
            });
            router = createRouter(pages, { window });
            await router.ready;
            expect(window.scrollY).toBe(900);
        }
        finally
        {
            window.scrollTo(0, 0);
            tall.remove();
        }
    });

    it("clears pending when disposed during a navigation, and settles ready on the first commit", async () =>
    {
        const gate = Promise.withResolvers<void>();
        const slow = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            slow: route({ path: "/slow", view: () => html`<p>slow</p>`, load: () => gate.promise.then(() => "loaded") }),
            fast: route({ path: "/fast", view: () => html`<p>fast</p>` })
        });
        history.replaceState(null, "", "/slow");
        const events: string[] = [];
        const first = createRouter(slow, { observe: (event) => events.push(event.type) });
        void first.navigate("/fast");
        await first.ready;
        expect(first.current.get()?.name).toBe("fast");
        expect(events).toEqual(["start", "start", "commit"]);
        first.dispose();

        history.replaceState(null, "", "/");
        const second = createRouter(slow);
        await second.ready;
        const navigation = second.navigate("/slow");
        expect(second.pending.get()).toBe(true);
        second.dispose();
        expect(second.pending.get()).toBe(false);
        gate.resolve();
        await navigation;
        expect(second.current.get()?.name).toBe("home");

        history.replaceState(null, "", "/slow");
        const failing = createRouter(defineRoutes({
            slow: route({ path: "/slow", view: () => html`<p>slow</p>`, load: () => Promise.reject(new Error("no")) })
        }), { onError: () => undefined });
        await expect(failing.ready).rejects.toThrow("no");
        failing.dispose();
    });

    it("compares matches without a trailing slash, a query, or a hash, and at the base root", async () =>
    {
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            settings: route({ path: "/settings", view: () => html`<p>settings</p>` })
        });
        history.replaceState(null, "", "/settings/?tab=1#top");
        const attached = createRouter(pages);
        await attached.ready;
        expect(attached.matches("/settings", { exact: true }).get()).toBe(true);
        expect(attached.matches("/settings/", { exact: true }).get()).toBe(true);
        expect(attached.matches("/settings?tab=1", { exact: true }).get()).toBe(true);
        expect(attached.matches("/settings#top").get()).toBe(true);
        expect(attached.matches("/sett", { exact: true }).get()).toBe(false);
        attached.dispose();

        history.replaceState(null, "", "/app");
        const based = createRouter(pages, { base: "/app/" });
        await based.ready;
        expect(based.href("home")).toBe("/app/");
        expect(based.matches(based.href("home"), { exact: true }).get()).toBe(true);
        expect(based.matches("/", { exact: true }).get()).toBe(true);
        based.dispose();
    });

    it("moves the history back when a back or forward navigation fails, so the address bar shows the page still shown", async () =>
    {
        let fail = false;
        const broken = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            notes: route({
                path: "/notes",
                view: () => html`<p>notes</p>`,
                load: () => (fail ? Promise.reject(new Error("gone")) : Promise.resolve("ok"))
            })
        });
        history.replaceState(null, "", "/");
        const errors: string[] = [];
        const events: string[] = [];
        const moved = createRouter(broken, { onError: (error) => errors.push((error as Error).message), observe: (event) => events.push(`${event.type}:${event.mode}`) });
        await moved.ready;
        await moved.navigate("/notes");
        await moved.navigate("/");
        expect(location.pathname).toBe("/");
        fail = true;
        events.length = 0;
        history.back();
        await until(() => errors.length === 1);
        await until(() => location.pathname === "/" && events.includes("commit:pop") === false && history.state?.position === 2);
        expect(moved.url.get().pathname).toBe("/");
        expect(moved.current.get()?.name).toBe("home");
        expect(events.filter((event) => event.startsWith("error"))).toEqual(["error:pop"]);
        moved.dispose();
    });

    it("reports a lazy import that rejects, replaces an entry on request, and leaves scrolling alone when asked", async () =>
    {
        history.replaceState(null, "", "/");
        const errors: string[] = [];
        const lazyTable = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            broken: route({ path: "/broken", view: lazy(() => Promise.reject(new Error("no module"))) }),
            files: route({ path: "/files/*rest", view: () => html`<p>files</p>` })
        });
        const scrolls = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
        const lazyRouter = createRouter(lazyTable, { onError: (error) => errors.push((error as Error).message), scroll: false });
        await lazyRouter.ready;
        await lazyRouter.navigate("/broken");
        expect(errors).toEqual(["no module"]);
        expect(lazyRouter.current.get()?.name).toBe("home");
        const length = history.length;
        await lazyRouter.navigate("/files/a/b", { replace: true });
        expect(history.length).toBe(length);
        expect(location.pathname).toBe("/files/a/b");
        expect(lazyRouter.current.get()?.params).toEqual({ rest: "a/b" });
        expect(lazyRouter.href("files", { rest: "x/y z" })).toBe("/files/x/y%20z");
        expect(scrolls).not.toHaveBeenCalled();
        scrolls.mockRestore();
        lazyRouter.dispose();
    });

    it("cancels a navigation a newer one replaced, without reporting its aborted loader as an error", async () =>
    {
        history.replaceState(null, "", "/");
        const onError = vi.fn();
        const events: string[] = [];
        const aborting = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            fetching: route({
                path: "/fetching",
                load: ({ abort }) => new Promise<string>((resolve, reject) =>
                {
                    const timer = setTimeout(() => resolve("loaded"), 50);
                    abort.addEventListener("abort", () =>
                    {
                        clearTimeout(timer);
                        reject(new DOMException("The navigation was replaced.", "AbortError"));
                    });
                }),
                view: ({ data }) => html`<p>${data}</p>`
            }),
            late: route({
                path: "/late",
                load: () => new Promise<string>((resolve) => setTimeout(() => resolve("late"), 30)),
                view: ({ data }) => html`<p>${data}</p>`
            })
        });
        router = createRouter(aborting, { window, onError, observe: (event) => events.push(`${event.type} ${event.url.pathname}`) });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);
        events.length = 0;

        const replaced = router.navigate("/fetching");
        await router.navigate("/");
        await replaced;
        const outlived = router.navigate("/late");
        await router.navigate("/");
        await outlived;

        expect(onError).not.toHaveBeenCalled();
        expect(events.filter((event) => !event.endsWith(" /"))).toEqual(["start /fetching", "cancel /fetching", "start /late", "cancel /late"]);
        expect(events.filter((event) => event.endsWith(" /"))).toEqual(["start /", "commit /", "start /", "commit /"]);
        expect(location.pathname).toBe("/");
        expect(el.textContent).toBe("home");
    });
});
