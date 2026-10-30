// Executed examples for the server rendering guide. Each region is the code
// the documentation shows; the checks after it run under Node.
import { describe, expect, it } from "vitest";
import { css, each, html, signal } from "zerolith";
import { renderStyles, renderToString } from "zerolith/ssr";

describe("server rendering guide", () =>
{
    it("render", () =>
    {
        // #region render
        const items = signal(["a", "b"]);
        const view = html`<ul>${each(items, (item) => item, (item) => html`<li>${item}</li>`)}</ul>`;

        const markup = renderToString(view);
        // <ul><li>a</li><li>b</li></ul>, plus markers hydrate() uses to adopt the nodes
        // #endregion render
        expect(markup.replace(/<!--\/?zl:p-->/g, "")).toBe("<ul><li>a</li><li>b</li></ul>");
    });

    it("styles", () =>
    {
        // #region styles
        const badge = css`:scope { font-weight: 700; }`;
        const markup = renderToString(html`<span class=${badge}>new</span>`);
        const head = renderStyles();            // a <style> with the badge's @scope rules
        // #endregion styles
        expect(markup).toContain(`<span class="zl-s ${badge.scope}">new</span>`);
        expect(head).toContain(`@scope (.${badge.scope})`);
    });
});
