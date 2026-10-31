import { afterEach, describe, expect, it, vi } from "vitest";
import { type Root, effect, html, render } from "zerolith";
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
});
