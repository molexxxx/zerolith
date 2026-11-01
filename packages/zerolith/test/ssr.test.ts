import { describe, expect, it, vi } from "vitest";
import { type Diagnostic, computed, css, each, effect, html, onDiagnostic, onDispose, signal, when } from "zerolith";
import { renderStyles, renderToString } from "zerolith/ssr";

/** A component that takes props, for the check that one passed uncalled is refused. */
function Greeting({ name }: { name: string }): unknown
{
    return html`<p>Hello, ${name}</p>`;
}

/** The rendered markup without the hydration markers, for assertions about content. */
function plain(view: unknown): string
{
    return renderToString(view).replace(/<!--\/?zl:p-->/g, "");
}

describe("renderToString", () =>
{
    it("renders text, nested templates, iterables, and nothing for booleans and null", () =>
    {
        const out = plain(html`<p>${"text"} ${1} ${html`<em>nested</em>`} ${[html`<i>a</i>`, "b"]}${true}${null}</p>`);
        expect(out).toBe("<p>text 1 <em>nested</em> <i>a</i>b</p>");
    });

    it("wraps every child part, item, and branch in hydration markers", () =>
    {
        const out = renderToString(html`<p>${"a"}${[1, 2]}${when(true, () => html`<b>x</b>`)}</p>`);
        expect(out).toBe("<!--zl:p--><p><!--zl:p-->a<!--/zl:p--><!--zl:p--><!--zl:p-->1<!--/zl:p--><!--zl:p-->2<!--/zl:p--><!--/zl:p--><!--zl:p--><!--zl:p--><b>x</b><!--/zl:p--><!--/zl:p--></p><!--/zl:p-->");
    });

    it("escapes text and attribute values", () =>
    {
        const out = plain(html`<p title=${"a\"b<c&d"}>${"<b>&</b>"}</p>`);
        expect(out).toBe("<p title=\"a&quot;b&lt;c&amp;d\">&lt;b&gt;&amp;&lt;/b&gt;</p>");
    });

    it("reads signals once and renders attribute kinds", () =>
    {
        const title = signal<string | null>("one");
        const on = signal(true);
        const off = signal(false);
        const out = plain(html`<input title=${title} class="a ${"b"} c" ?disabled=${on} ?hidden=${off} .value=${"ignored"} @click=${() => undefined} ref=${() => undefined}>`);
        expect(out).toBe("<input title=\"one\" class=\"a b c\" disabled=\"\">");
        title.set(null);
        expect(plain(html`<p title=${title}></p>`)).toBe("<p></p>");
    });

    it("blocks scriptable URLs and reports a warning", () =>
    {
        const seen: Diagnostic[] = [];
        const off = onDiagnostic((d) => seen.push(d));
        const out = plain(html`<a href=${"javascript:alert(1)"}>x</a><img src=${"data:image/png;base64,AA=="}>`);
        off();
        expect(out).toBe("<a>x</a><img src=\"data:image/png;base64,AA==\">");
        expect(seen.map((d) => d.code)).toEqual(["unsafe_url_blocked"]);
    });

    it("decides a URL from its scheme, however long the URL is", () =>
    {
        const seen: Diagnostic[] = [];
        const off = onDiagnostic((d) => seen.push(d));
        const photo = `data:image/jpeg;base64,${"A".repeat(2_000_000)}`;
        const out = plain(html`<img src=${photo}><a href=${"\u0000 j\na\tvascript:alert(1)"}>x</a><iframe src=${"data:text/html,<p>"}></iframe>`);
        off();
        expect(out.startsWith("<img src=\"data:image/jpeg;base64,AAAA")).toBe(true);
        expect(out.endsWith("<a>x</a><iframe></iframe>")).toBe(true);
        expect(seen.map((d) => d.code)).toEqual(["unsafe_url_blocked", "unsafe_url_blocked"]);
    });

    it("prints a warning no listener hears, and leaves it to a listener once one is registered", () =>
    {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        try
        {
            plain(html`<a href=${"javascript:alert(1)"}>x</a>`);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0]?.[0])).toMatch(/^\[zerolith\] unsafe_url_blocked: .+https:\/\/\S+\/e\/unsafe_url_blocked\?/);
            warn.mockClear();
            const off = onDiagnostic(() => undefined);
            plain(html`<a href=${"javascript:alert(1)"}>x</a>`);
            off();
            expect(warn).not.toHaveBeenCalled();
        }
        finally
        {
            warn.mockRestore();
        }
    });

    it("calls a function that returns the view inside the render's scope", () =>
    {
        let cleaned = 0;
        function Panel(): unknown
        {
            onDispose(() =>
            {
                cleaned += 1;
            });
            return html`<p>panel</p>`;
        }
        expect(renderToString(() => Panel())).toContain("<p>panel</p>");
        expect(cleaned).toBe(1);
        expect(() => renderToString(Greeting)).toThrow(/mount_component_uncalled/);
    });

    it("renders each and when for the current state and checks keys", () =>
    {
        const items = signal([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
        const show = signal(false);
        const view = html`<ul>${each(items, (item) => item.id, (item, index) => html`<li>${computed(() => `${index.get()}:${item.get().name}`)}</li>`)}</ul>${when(show, () => html`<p>on</p>`, () => html`<p>off</p>`)}`;
        expect(plain(view)).toBe("<ul><li>0:a</li><li>1:b</li></ul><p>off</p>");
        show.set(true);
        expect(plain(view)).toBe("<ul><li>0:a</li><li>1:b</li></ul><p>on</p>");
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
        expect(plain(when(true, () => Component()))).toBe("<p>0</p>");
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
        expect(plain(html`<section class=${card}></section>`)).toBe(`<section class="zl-s ${card.scope}"></section>`);
        expect(renderStyles()).toContain(`<style>@scope (.${card.scope}) to (:scope .zl-s > *) {`);
    });
});
