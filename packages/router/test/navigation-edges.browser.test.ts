// Navigations that fail after the page is committed, shallow navigations
// made from effects, and back and forward between a page's own entries.
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Renderable, type Root, type View, effect, html, render, scope, signal } from "zerolith";
import { type RouteTable, type Router, createRouter, defineRoutes, lazy, route } from "@zerolith/router";

let root: Root | undefined;
let host: HTMLElement | undefined;
let router: Router<RouteTable> | undefined;

async function until(condition: () => boolean, label = ""): Promise<void>
{
    for (let i = 0; i < 100 && !condition(); i++)
    {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(condition(), label).toBe(true);
}

function wait(ms: number): Promise<void>
{
    return new Promise((resolve) => setTimeout(resolve, ms));
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

describe("router navigation edge cases", () =>
{
    it("keeps the failed view at the URL Back or Forward moved to when that page's view throws", async () =>
    {
        history.replaceState(null, "", "/");
        let broken = false;
        const errors: unknown[] = [];
        const events: string[] = [];
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            flaky: route({
                path: "/flaky",
                view: (): View =>
                {
                    if (broken)
                    {
                        throw new Error("view");
                    }
                    return html`<p>flaky</p>`;
                }
            }),
            last: route({ path: "/last", view: () => html`<p>last</p>` })
        });
        router = createRouter(pages, {
            window,
            onError: (error) => errors.push(error),
            failed: () => html`<p>failed</p>`,
            observe: (event) => events.push(`${event.type} ${event.mode} ${event.url.pathname}`)
        });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);
        await router.navigate("/flaky");
        await router.navigate("/last");
        expect(el.textContent).toBe("last");
        broken = true;
        events.length = 0;
        history.back();
        await until(() => errors.length === 1, "the view's error is reported");
        await wait(150);
        await settled(router);
        const outcome = { path: location.pathname, text: el.textContent, url: router.url.get().pathname, events };
        expect(outcome).toEqual({ path: "/flaky", text: "failed", url: "/flaky", events: ["start pop /flaky", "error pop /flaky"] });
    });

    it("keeps the scroll position when Forward returns to the page's own shallow entry", async () =>
    {
        history.replaceState(null, "", "/");
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<h1>Home</h1>` }),
            list: route({ path: "/list", view: () => html`<div style="height: 5000px">tall</div><input id="q">` })
        });
        router = createRouter(pages, { window });
        await settled(router);
        mount(html`<main>${router.outlet()}</main>`);
        await router.navigate("/list");
        window.scrollTo(0, 700);
        await wait(30);
        expect(window.scrollY).toBe(700);
        await router.navigate("/list?q=a", { shallow: true });
        expect(window.scrollY).toBe(700);
        history.back();
        await until(() => location.search === "", "back to the entry before the shallow one");
        await wait(30);
        const afterBack = window.scrollY;
        history.forward();
        await until(() => location.search === "?q=a", "forward to the shallow entry");
        await wait(30);
        expect({ afterBack, afterForward: window.scrollY }).toEqual({ afterBack: 700, afterForward: 700 });
        window.scrollTo(0, 0);
    });

    it("pushes one entry per change when an effect makes the shallow navigation", async () =>
    {
        history.replaceState(null, "", "/");
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<h1>Home</h1>` }),
            list: route({ path: "/list", view: () => html`<p>list</p>` })
        });
        const made = createRouter(pages, { window });
        router = made;
        await settled(made);
        mount(html`<main>${made.outlet()}</main>`);
        await made.navigate("/list");
        const pushed = vi.spyOn(history, "pushState");
        const query = signal("");
        let runs = 0;
        const handle = scope(() => effect(() =>
        {
            runs += 1;
            const text = query.get();
            if (text !== "")
            {
                void made.navigate(`/list?q=${text}`, { shallow: true });
            }
        }));
        query.set("a");
        await wait(20);
        const outcome = { pushes: pushed.mock.calls.length, runs };
        pushed.mockRestore();
        handle.dispose();
        expect(outcome).toEqual({ pushes: 1, runs: 2 });
    });

    it("refuses a focus selector the browser cannot parse when the router is made", () =>
    {
        const pages = defineRoutes({ home: route({ path: "/", view: () => html`<h1>Home</h1>` }) });
        expect(() => createRouter(pages, { window, focus: "h1:not(" })).toThrow(expect.objectContaining({ name: "SyntaxError" }));
    });

    it("renders the page again when the URL whose view threw is opened again", async () =>
    {
        history.replaceState(null, "", "/");
        let broken = true;
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            flaky: route({
                path: "/flaky",
                view: (): View =>
                {
                    if (broken)
                    {
                        throw new Error("view");
                    }
                    return html`<p>flaky</p>`;
                }
            })
        });
        router = createRouter(pages, { window, onError: () => undefined, failed: () => html`<p>failed</p><a id="again" href="/flaky">Try again</a>` });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);
        await router.navigate("/flaky");
        expect(el.textContent).toBe("failedTry again");
        broken = false;
        (el.querySelector("#again") as HTMLElement).click();
        await wait(50);
        await settled(router);
        expect(el.textContent).toBe("flaky");
    });

    it("shows the failed view for a view that throws on the first load, and rejects ready", async () =>
    {
        history.replaceState(null, "", "/broken");
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            broken: route({
                path: "/broken",
                view: (): View =>
                {
                    throw new Error("view");
                }
            })
        });
        const errors: unknown[] = [];
        router = createRouter(pages, { window, onError: (error) => errors.push(error), failed: () => html`<p>failed</p>` });
        let readyError: unknown;
        router.ready.catch((error: unknown) =>
        {
            readyError = error;
        });
        const el = mount(html`<main>${router.outlet()}</main>`);
        await settled(router);
        await wait(20);
        expect({ text: el.textContent, errors: errors.length, ready: String(readyError) }).toEqual({ text: "failed", errors: 1, ready: "Error: view" });
    });

    it("keeps the page when a lazy view rejects on a later navigation, and loads it on the next try", async () =>
    {
        history.replaceState(null, "", "/");
        let fail = true;
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            late: route({
                path: "/late",
                view: lazy(() => (fail ? Promise.reject(new Error("chunk")) : Promise.resolve(() => html`<p>late</p>`)))
            })
        });
        const errors: unknown[] = [];
        router = createRouter(pages, { window, onError: (error) => errors.push(error) });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);
        await router.navigate("/late");
        expect({ text: el.textContent, path: location.pathname, errors: errors.length, pending: router.pending.get() }).toEqual({ text: "home", path: "/", errors: 1, pending: false });
        fail = false;
        await router.navigate("/late");
        expect(el.textContent).toBe("late");
    });

    it("leaves the outlet empty at the new URL when the failed view throws too", async () =>
    {
        history.replaceState(null, "", "/");
        const pages = defineRoutes({
            home: route({ path: "/", view: () => html`<p>home</p>` }),
            broken: route({
                path: "/broken",
                view: (): View =>
                {
                    throw new Error("view");
                }
            })
        });
        const errors: unknown[] = [];
        router = createRouter(pages, {
            window,
            onError: (error) => errors.push(error),
            failed: (): View =>
            {
                throw new Error("failed view");
            }
        });
        await settled(router);
        const el = mount(html`<main>${router.outlet()}</main>`);
        await router.navigate("/broken");
        expect({ text: el.textContent, path: location.pathname, errors: errors.map(String) }).toEqual({ text: "", path: "/broken", errors: ["Error: failed view"] });
        await router.navigate("/");
        expect(el.textContent).toBe("home");
    });
});
