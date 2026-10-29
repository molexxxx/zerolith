// Executed examples for the server rendering guide.
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
        expect(markup.replace(/<!--\/?zl:p-->/g, "")).toBe("<ul><li>a</li><li>b</li></ul>");
        // The comment markers left in place let hydrate() bind the same view to these nodes.
        // #endregion render
    });

    it("styles", () =>
    {
        // #region styles
        const badge = css`:scope { font-weight: 700; }`;
        const markup = renderToString(html`<span class=${badge}>new</span>`);

        expect(markup).toContain(`<span class="zl-s ${badge.scope}">new</span>`);
        expect(renderStyles()).toContain(`@scope (.${badge.scope})`);
        // #endregion styles
    });
});
