import { describe, expect, it } from "vitest";
import { html } from "zerolith";
import { renderToString } from "zerolith/ssr";
import { createRouter, defineRoutes, route } from "@zerolith/router";
import { renderHead } from "@zerolith/router/server";

const routes = defineRoutes({
    home: route({ path: "/", view: () => html`<h1>Home</h1>`, head: { title: "Home", description: "The <start> & more" } }),
    note: route({
        path: "/notes/:id",
        load: ({ params }) => Promise.resolve({ title: `Note ${params.id}` }),
        view: ({ data }) => html`<article>${data.title}</article>`,
        head: ({ data }) => ({ title: data.title })
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
