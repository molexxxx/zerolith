// Executed examples for the routing guide.
import { afterEach, describe, expect, it, vi } from "vitest";
import { html, render } from "zerolith";
import { type RouteTable, type Router, createRouter, defineRoutes, route } from "@zerolith/router";

let current: Router<RouteTable> | undefined;

afterEach(() =>
{
    current?.dispose();
    document.querySelector("#app")?.remove();
    history.replaceState(null, "", "/");
});

async function settled(router: Router<RouteTable>): Promise<void>
{
    await vi.waitFor(() =>
    {
        expect(router.pending.get()).toBe(false);
    });
}

describe("routing guide", () =>
{
    it("table and navigation", async () =>
    {
        history.replaceState(null, "", "/");
        const host = document.createElement("div");
        host.id = "app";
        document.body.append(host);
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
                load: async ({ params }) => releases.find((release) => release.tag === params.tag),
                view: ({ params, data }) => html`<h1>${params.tag}: ${data?.name ?? "unknown"}</h1>`,
                head: ({ data }) => ({ title: data?.name ?? "Unknown release" })
            })
        });

        const router = createRouter(routes, { fallback: () => html`<h1>Not found</h1>` });
        const first = router.href("release", { tag: "v1" });   // "/releases/v1"
        // #endregion table
        current = router;
        expect(first).toBe("/releases/v1");
        await settled(router);
        // #region navigate
        render(html`
            <nav>
                <a href=${router.href("home")}>Home</a>
                <a href=${first}>First release</a>
            </nav>
            <main>${router.outlet()}</main>`, "#app");
        // #endregion navigate
        expect(host.querySelector("h1")?.textContent).toBe("Home");
        host.querySelectorAll("a")[1]?.click();
        await vi.waitFor(() => expect(host.querySelector("h1")?.textContent).toBe("v1: First"));
        expect(location.pathname).toBe("/releases/v1");
        expect(document.title).toBe("First");
        // #region navigate

        // From script, such as after saving a form:
        await router.navigate("/missing");      // nothing matches: the fallback renders
        // #endregion navigate
        expect(host.querySelector("h1")?.textContent).toBe("Not found");
    });
});
