import { describe, expect, it } from "vitest";
import { html } from "zerolith";
import { renderToString } from "zerolith/ssr";
import { createRouter, defineRoutes, route } from "@zerolith/router";
import { renderHead, renderRouteState } from "@zerolith/router/server";

const routes = defineRoutes({
    home: route({ path: "/", view: () => html`<h1>Home</h1>`, head: { title: "Home", description: "The <start> & more" } }),
    note: route({
        path: "/notes/:id",
        load: ({ params }) => Promise.resolve({ title: `Note ${params.id}` }),
        view: ({ data }) => html`<article>${data.title}</article>`,
        head: ({ data }) => ({ title: data.title })
    }),
    raw: route({
        path: "/raw",
        load: () => Promise.resolve({ markup: "</script><b>&amp;" }),
        view: ({ data }) => html`<pre>${data.markup}</pre>`
    })
});

describe("the router without a window", () =>
{
    it("is ready at once, navigates on demand, and exposes the head of the current route", async () =>
    {
        const router = createRouter(routes, { fallback: (url) => html`<p>Nothing at ${url.pathname}</p>` });
        await router.ready;
        expect(router.current.get()).toBeUndefined();
        expect(router.head.get()).toEqual({});

        await router.navigate("/notes/7?x=1");
        expect(router.current.get()?.name).toBe("note");
        expect(router.url.get().search).toBe("?x=1");
        expect(router.head.get()).toEqual({ title: "Note 7" });
        expect(renderToString(html`<main>${router.outlet()}</main>`).replace(/<!--\/?zl:p-->/g, "")).toBe("<main><article>Note 7</article></main>");

        await router.navigate("/missing");
        expect(router.current.get()).toBeUndefined();
        expect(router.head.get()).toEqual({});
        expect(renderToString(router.outlet()).replace(/<!--\/?zl:p-->/g, "")).toBe("<p>Nothing at /missing</p>");
        router.dispose();
    });

    it("serves under a base path, with route paths relative to it", async () =>
    {
        const router = createRouter(routes, { base: "/app", fallback: (url) => html`<p>Nothing at ${url.pathname}</p>` });
        expect(router.href("home")).toBe("/app/");
        expect(router.href("note", { id: "7" })).toBe("/app/notes/7");

        await router.navigate("/app/notes/7");
        expect(router.current.get()?.name).toBe("note");
        await router.navigate("/notes/8");
        expect(router.url.get().pathname).toBe("/app/notes/8");
        expect(router.current.get()?.params).toEqual({ id: "8" });
        expect(router.matches("/notes").get()).toBe(true);
        await router.navigate("/app");
        expect(router.current.get()?.name).toBe("home");
        await router.navigate("http://localhost/notes/9");
        expect(router.current.get()).toBeUndefined();
        expect(renderToString(router.outlet()).replace(/<!--\/?zl:p-->/g, "")).toBe("<p>Nothing at /notes/9</p>");
        router.dispose();
        const relative = createRouter(routes, { base: "./" });
        expect(relative.href("note", { id: "1" })).toBe("/notes/1");
        relative.dispose();
    });

    it("renders head metadata with escaping", async () =>
    {
        const router = createRouter(routes);
        await router.navigate("/");
        expect(renderHead(router.head.get())).toBe("<title>Home</title><meta name=\"description\" content=\"The &lt;start&gt; &amp; more\">");
        expect(renderHead({})).toBe("");
        expect(renderHead({ title: "A <b>" })).toBe("<title>A &lt;b&gt;</title>");
        router.dispose();
    });
});

describe("renderRouteState", () =>
{
    it("embeds the current route's data with its name and URL, escaped against script injection", async () =>
    {
        const router = createRouter(routes);
        await router.navigate("/raw?q=1");
        const script = renderRouteState(router);
        expect(script.startsWith("<script type=\"application/json\" data-zerolith-route>")).toBe(true);
        expect(script).not.toContain("</script><b>");
        const json = script.slice(script.indexOf(">") + 1, script.lastIndexOf("</script>"));
        expect(JSON.parse(json)).toEqual({ name: "raw", href: "/raw?q=1", data: { markup: "</script><b>&amp;" } });
        router.dispose();
    });

    it("is empty without a match or without data", async () =>
    {
        const router = createRouter(routes);
        expect(renderRouteState(router)).toBe("");
        await router.navigate("/");
        expect(renderRouteState(router)).toBe("");
        router.dispose();
    });
});
