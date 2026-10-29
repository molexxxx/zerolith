import { afterEach, describe, expect, it } from "vitest";
import { html } from "zerolith";
import { ROUTE_STATE_SELECTOR, type RouteTable, type Router, createRouter, defineRoutes, route } from "@zerolith/router";

let loads: string[] = [];
let router: Router<RouteTable> | undefined;

const routes = defineRoutes({
    note: route({
        path: "/notes/:id",
        load: ({ params, url }) =>
        {
            loads.push(url.pathname + url.search);
            return Promise.resolve({ id: params.id, fresh: true });
        },
        view: ({ data }) => html`<p>${data.id}</p>`
    })
});

function embed(state: unknown): void
{
    const script = document.createElement("script");
    script.type = "application/json";
    script.setAttribute("data-zerolith-route", "");
    script.textContent = typeof state === "string" ? state : JSON.stringify(state);
    document.body.append(script);
}

afterEach(() =>
{
    router?.dispose();
    router = undefined;
    loads = [];
    document.querySelector(ROUTE_STATE_SELECTOR)?.remove();
    history.replaceState(null, "", "/");
});

describe("embedded route state", () =>
{
    it("replaces the loader for the initial navigation when the route and URL match, once", async () =>
    {
        history.replaceState(null, "", "/notes/1?tab=a");
        embed({ name: "note", href: "/notes/1?tab=a", data: { id: "1", fresh: false } });
        router = createRouter(routes);
        await router.ready;
        expect(loads).toEqual([]);
        expect(router.current.get()?.data).toEqual({ id: "1", fresh: false });
        expect(document.querySelector(ROUTE_STATE_SELECTOR)).toBeNull();
        await router.navigate("/notes/1?tab=a");
        expect(loads).toEqual(["/notes/1?tab=a"]);
    });

    it("runs the loader when the embedded state is for another URL, another route, or is not JSON", async () =>
    {
        history.replaceState(null, "", "/notes/2");
        embed({ name: "note", href: "/notes/1", data: { id: "1", fresh: false } });
        router = createRouter(routes);
        await router.ready;
        expect(loads).toEqual(["/notes/2"]);
        expect(router.current.get()?.data).toEqual({ id: "2", fresh: true });
        router.dispose();

        loads = [];
        embed("{not json");
        router = createRouter(routes);
        await router.ready;
        expect(loads).toEqual(["/notes/2"]);
        expect(document.querySelector(ROUTE_STATE_SELECTOR)).toBeNull();
    });
});
