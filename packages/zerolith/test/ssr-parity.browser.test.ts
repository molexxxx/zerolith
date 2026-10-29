import { afterEach, describe, expect, it } from "vitest";
import { type Root, computed, each, html, render, signal, when } from "zerolith";
import { renderToString } from "zerolith/ssr";

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() =>
{
    root?.dispose();
    root = undefined;
    host?.remove();
    host = undefined;
});

/** The browser's markup with the renderer's own comment anchors removed. */
function browserMarkup(view: unknown): string
{
    host = document.createElement("div");
    document.body.append(host);
    root = render(view, host);
    return host.innerHTML.replace(/<!--[^>]*-->/g, "");
}

describe("server and browser renderers agree", () =>
{
    it("produce the same markup for the same view", () =>
    {
        const items = signal([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
        const title = signal("t");
        const on = signal(true);
        const view = () => html`
            <section title=${title} class="x ${"y"}" ?hidden=${computed(() => !on.get())}>
                <ul>${each(items, (item) => item.id, (item) => html`<li data-id=${computed(() => item.get().id)}>${computed(() => item.get().name)}</li>`)}</ul>
                ${when(on, () => html`<p>on &amp; <b>${"<i>"}</b></p>`)}
                <a href=${"/x?a=1&b=2"}>link</a>
            </section>`;
        const server = renderToString(view());
        const browser = browserMarkup(view());
        expect(server.replace(/\s+/g, " ")).toBe(browser.replace(/\s+/g, " "));
    });
});
