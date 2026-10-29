// Executed examples for the server rendering guide: hydrating a routed application.
import { afterEach, describe, expect, it } from "vitest";
import { type Root, html, hydrate } from "zerolith";
import { renderToString } from "zerolith/ssr";
import { type RouteTable, type Router, createRouter, defineRoutes, route } from "@zerolith/router";
import { renderRouteState } from "@zerolith/router/server";

let loads = 0;

const routes = defineRoutes({
    home: route({ path: "/", view: () => html`<h1>Notes</h1>` }),
    note: route({
        path: "/notes/:id",
        load: ({ params }) =>
        {
            loads += 1;
            return Promise.resolve({ title: `Note ${params.id}` });
        },
        view: ({ data }) => html`<h1>${data.title}</h1><a href="/">All notes</a>`
    })
});

function App(router: Router<RouteTable>): unknown
{
    return html`<main>${router.outlet()}</main>`;
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let client: Router<RouteTable> | undefined;

afterEach(() =>
{
    client?.dispose();
    root?.dispose();
    host?.remove();
    history.replaceState(null, "", "/");
});

describe("server rendering guide: hydration", () =>
{
    it("adopts the server's markup and data for the current route", async () =>
    {
        host = document.createElement("div");
        document.body.append(host);
        const container = host;
        history.replaceState(null, "", "/notes/1");

        // On the server, for the request's URL:
        const server = createRouter(routes, { window: null });
        await server.navigate("/notes/1");
        container.innerHTML = renderToString(App(server)) + renderRouteState(server);
        server.dispose();
        expect(loads).toBe(1);

        // #region hydrate
        const router = createRouter(routes);
        await router.ready;                             // the initial navigation, with the data the server embedded
        const handle = hydrate(App(router), container);
        // #endregion hydrate
        client = router;
        root = handle;
        expect(loads).toBe(1);                          // the loader did not run again in the browser
        expect(handle.mismatches).toEqual([]);
        expect(container.querySelector("h1")?.textContent).toBe("Note 1");
        expect(document.querySelector("[data-zerolith-route]")).toBeNull();

        container.querySelector("a")?.click();
        await router.navigate("/");
        expect(container.querySelector("h1")?.textContent).toBe("Notes");
        await router.navigate("/notes/2");
        expect(loads).toBe(2);                          // later navigations load as usual
    });
});
