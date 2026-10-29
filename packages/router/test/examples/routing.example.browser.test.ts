// Executed examples for the routing guide.
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Root, html, render } from "zerolith";
import { type RouteTable, type Router, createRouter, defineRoutes, route } from "@zerolith/router";

let root: Root | undefined;
let host: HTMLElement | undefined;
let router: Router<RouteTable> | undefined;

afterEach(() =>
{
    router?.dispose();
    root?.dispose();
    host?.remove();
    history.replaceState(null, "", "/");
});

async function settled(current: Router<RouteTable>): Promise<void>
{
    await vi.waitFor(() =>
    {
        expect(current.pending.get()).toBe(false);
    });
}

describe("routing guide", () =>
{
    it("table and navigation", async () =>
    {
        history.replaceState(null, "", "/");
        // #region table
        const releases = [{ tag: "v1", name: "First" }];

        const routes = defineRoutes({
            home: route({
                path: "/",
                view: () => html`<h1>Home</h1>`,
                head: { title: "Home" }
            }),
            release: route({
                path: "/releases/:tag",
                load: ({ params }) => Promise.resolve(releases.find((release) => release.tag === params.tag)),
                view: ({ params, data }) => html`<h1>${params.tag}: ${data?.name ?? "unknown"}</h1>`,
                head: ({ data }) => ({ title: data?.name ?? "Unknown release" })
            })
        });

        const app = createRouter(routes, { fallback: () => html`<h1>Not found</h1>` });
        expect(app.href("release", { tag: "v1" })).toBe("/releases/v1");
        // #endregion table
        router = app;
        await settled(app);

        // #region navigate
        host = document.createElement("div");
        document.body.append(host);
        root = render(html`<main>${app.outlet()}</main><a id="link" href="/releases/v1">First release</a>`, host);
        expect(host.querySelector("h1")?.textContent).toBe("Home");

        await app.navigate("/releases/v1");
        expect(location.pathname).toBe("/releases/v1");
        expect(host.querySelector("h1")?.textContent).toBe("v1: First");
        expect(document.title).toBe("First");

        await app.navigate("/missing");
        expect(host.querySelector("h1")?.textContent).toBe("Not found");
        // #endregion navigate
    });
});
