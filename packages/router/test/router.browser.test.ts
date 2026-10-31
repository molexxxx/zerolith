import { afterEach, describe, expect, it, vi } from "vitest";
import { type Root, effect, html, onDispose, render, signal } from "zerolith";
import { type RouteTable, type Router, createRouter, defineRoutes, lazy, route } from "@zerolith/router";

let root: Root | undefined;
let host: HTMLElement | undefined;
let router: Router<RouteTable> | undefined;

function mount(view: unknown): HTMLElement
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
        expect(typed.href("docs", { path: "a/b" })).toBe("/docs/a%2Fb");
        // @ts-expect-error a parameter is required
        typed.href("release");
        // @ts-expect-error the route does not exist
        typed.href("nope");
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
