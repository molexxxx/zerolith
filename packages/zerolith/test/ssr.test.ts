import { describe, expect, it } from "vitest";
import { type Diagnostic, computed, css, each, effect, html, onDiagnostic, signal, when } from "zerolith";
import { renderStyles, renderToString } from "zerolith/ssr";

describe("renderToString", () =>
{
    it("renders text, nested templates, iterables, and nothing for booleans and null", () =>
    {
        const out = renderToString(html`<p>${"text"} ${1} ${html`<em>nested</em>`} ${[html`<i>a</i>`, "b"]}${true}${null}</p>`);
        expect(out).toBe("<p>text 1 <em>nested</em> <i>a</i>b</p>");
    });

    it("escapes text and attribute values", () =>
    {
        const out = renderToString(html`<p title=${"a\"b<c&d"}>${"<b>&</b>"}</p>`);
        expect(out).toBe("<p title=\"a&quot;b&lt;c&amp;d\">&lt;b&gt;&amp;&lt;/b&gt;</p>");
    });

    it("reads signals once and renders attribute kinds", () =>
    {
        const title = signal<string | null>("one");
        const on = signal(true);
        const off = signal(false);
        const out = renderToString(html`<input title=${title} class="a ${"b"} c" ?disabled=${on} ?hidden=${off} .value=${"ignored"} @click=${() => undefined} ref=${() => undefined}>`);
        expect(out).toBe("<input title=\"one\" class=\"a b c\" disabled=\"\">");
        title.set(null);
        expect(renderToString(html`<p title=${title}></p>`)).toBe("<p></p>");
    });

    it("blocks scriptable URLs and reports a warning", () =>
    {
        const seen: Diagnostic[] = [];
        const off = onDiagnostic((d) => seen.push(d));
        const out = renderToString(html`<a href=${"javascript:alert(1)"}>x</a><img src=${"data:image/png;base64,AA=="}>`);
        off();
        expect(out).toBe("<a>x</a><img src=\"data:image/png;base64,AA==\">");
        expect(seen.map((d) => d.code)).toEqual(["unsafe_url_blocked"]);
    });

    it("renders each and when for the current state and checks keys", () =>
    {
        const items = signal([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
        const show = signal(false);
        const view = html`<ul>${each(items, (item) => item.id, (item, index) => html`<li>${computed(() => `${index.get()}:${item.get().name}`)}</li>`)}</ul>${when(show, () => html`<p>on</p>`, () => html`<p>off</p>`)}`;
        expect(renderToString(view)).toBe("<ul><li>0:a</li><li>1:b</li></ul><p>off</p>");
        show.set(true);
        expect(renderToString(view)).toBe("<ul><li>0:a</li><li>1:b</li></ul><p>on</p>");
        expect(() => renderToString(each([{ id: 1 }, { id: 1 }], (item) => item.id, () => html`<i></i>`))).toThrow(/each_key_duplicate/);
    });

    it("disposes effects created while rendering", () =>
    {
        const tick = signal(0);
        let runs = 0;
        function Component()
        {
            effect(() =>
            {
                tick.get();
                runs++;
            });
            return html`<p>${tick}</p>`;
        }
        expect(renderToString(when(true, () => Component()))).toBe("<p>0</p>");
        tick.set(1);
        expect(runs).toBe(1);
    });

    it("rejects functions and plain objects with a coded error", () =>
    {
        expect(() => renderToString(html`<p>${() => undefined}</p>`)).toThrow(/unrenderable_value/);
        expect(() => renderToString(html`<p>${{ a: 1 }}</p>`)).toThrow(/unrenderable_value/);
    });

    it("stringifies scoped styles and emits their sheets", () =>
    {
        const card = css`:scope { padding: 1px; }`;
        expect(renderToString(html`<section class=${card}></section>`)).toBe(`<section class="zl-s ${card.scope}"></section>`);
        expect(renderStyles()).toContain(`<style>@scope (.${card.scope}) to (:scope .zl-s > *) {`);
    });
});
