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

        expect(renderToString(view)).toBe("<ul><li>a</li><li>b</li></ul>");
        // #endregion render
    });

    it("styles", () =>
    {
        // #region styles
        const badge = css`:scope { font-weight: 700; }`;
        const markup = renderToString(html`<span class=${badge}>new</span>`);

        expect(markup).toBe(`<span class="zl-s ${badge.scope}">new</span>`);
        expect(renderStyles()).toContain(`@scope (.${badge.scope})`);
        // #endregion styles
    });
});
