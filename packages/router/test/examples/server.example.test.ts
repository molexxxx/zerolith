// Executed examples for the server rendering guide: a routed application answering a Request.
import { describe, expect, it } from "vitest";
import { html } from "zerolith";
import { renderStyles, renderToString } from "zerolith/ssr";
import { type RouteTable, type Router, createRouter, defineRoutes, route } from "@zerolith/router";
import { renderHead, renderRouteState } from "@zerolith/router/server";

const notes = new Map([["1", { title: "Routing" }], ["2", { title: "Forms" }]]);

const routes = defineRoutes({
    home: route({ path: "/", view: () => html`<h1>Notes</h1>`, head: { title: "Notes" } }),
    note: route({
        path: "/notes/:id",
        load: ({ params }) =>
        {
            const note = notes.get(params.id);
            return note === undefined ? Promise.reject(new Error(`no note ${params.id}`)) : Promise.resolve(note);
        },
        view: ({ data }) => html`<h1>${data.title}</h1>`,
        head: ({ data }) => ({ title: `${data.title} | Notes` })
    })
});

function App(router: Router<RouteTable>): unknown
{
    return html`<main>${router.outlet()}</main>`;
}

// #region handler
async function handle(request: Request): Promise<Response>
{
    const url = new URL(request.url);
    const router = createRouter(routes, { fallback: () => html`<h1>Not found</h1>` });
    await router.navigate(url.pathname + url.search);

    const body = renderToString(App(router));
    const document = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8">${renderHead(router.head.get())}${renderStyles()}</head>
<body><div id="app">${body}</div>${renderRouteState(router)}<script type="module" src="/app.js"></script></body>
</html>`;
    router.dispose();
    return new Response(document, {
        status: router.current.get() === undefined ? 404 : 200,
        headers: { "content-type": "text/html; charset=utf-8" }
    });
}
// #endregion handler

describe("server rendering guide: routed application", () =>
{
    it("answers a request with the rendered route, its head, and the right status", async () =>
    {
        const found = await handle(new Request("https://notes.example/notes/1"));
        expect(found.status).toBe(200);
        const markup = await found.text();
        expect(markup).toContain("<title>Routing | Notes</title>");
        expect(markup.replace(/<!--\/?zl:p-->/g, "")).toContain("<main><h1>Routing</h1></main>");
        expect(markup).toContain("<script type=\"application/json\" data-zerolith-route>{\"name\":\"note\",\"href\":\"/notes/1\",\"data\":{\"title\":\"Routing\"}}</script>");

        const missing = await handle(new Request("https://notes.example/nowhere"));
        expect(missing.status).toBe(404);
        expect(await missing.text()).toContain("<h1>Not found</h1>");

        await expect(handle(new Request("https://notes.example/notes/9"))).rejects.toThrow("no note 9");
    });
});
