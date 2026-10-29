// Executed examples for the server rendering guide: hydrating a routed application.
import { afterEach, describe, expect, it } from "vitest";
import { type Root, html, hydrate } from "zerolith";
import { renderToString } from "zerolith/ssr";
import { type RouteTable, type Router, createRouter, defineRoutes, route } from "@zerolith/router";

const routes = defineRoutes({
    home: route({ path: "/", view: () => html`<h1>Notes</h1>` }),
    note: route({
        path: "/notes/:id",
        load: ({ params }) => Promise.resolve({ title: `Note ${params.id}` }),
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
    it("adopts the server's markup for the current route", async () =>
    {
        host = document.createElement("div");
        document.body.append(host);
        const container = host;
        history.replaceState(null, "", "/notes/1");

        // On the server, for the request's URL:
        const server = createRouter(routes);
        await server.navigate("/notes/1");
        container.innerHTML = renderToString(App(server));
        server.dispose();

        // #region hydrate
        const router = createRouter(routes);
        await router.ready;                             // the initial navigation, including the loader
        const handle = hydrate(App(router), container);
        // #endregion hydrate
        client = router;
        root = handle;
        expect(handle.mismatches).toEqual([]);
        expect(container.querySelector("h1")?.textContent).toBe("Note 1");

        container.querySelector("a")?.click();
        await router.navigate("/");
        expect(container.querySelector("h1")?.textContent).toBe("Notes");
    });
});
