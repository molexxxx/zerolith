import { afterEach, describe, expect, it, vi } from "vitest";
import { type Diagnostic, type HydrateResult, computed, each, html, hydrate, onDiagnostic, signal, when } from "zerolith";
import { renderToString } from "zerolith/ssr";

let host: HTMLElement | undefined;
let result: HydrateResult | undefined;

/** Server-renders `view` into a fresh host, then hydrates `clientView` (the same view by default) into it. */
function serverThenClient(view: unknown, clientView: unknown = view): HTMLElement
{
    host = document.createElement("div");
    host.innerHTML = renderToString(view);
    document.body.append(host);
    result = hydrate(clientView, host);
    return host;
}

afterEach(() =>
{
    result?.dispose();
    result = undefined;
    host?.remove();
    host = undefined;
});

describe("hydrate", () =>
{
    it("takes a selector for the container and reports one that matches nothing", () =>
    {
        host = document.createElement("div");
        host.id = "hydrate-host";
        host.innerHTML = renderToString(html`<p>${"same"}</p>`);
        document.body.append(host);
        result = hydrate(html`<p>${"same"}</p>`, "#hydrate-host");
        expect(result.container).toBe(host);
        expect(result.mismatches).toEqual([]);
        expect(() => hydrate(html`<p>${"same"}</p>`, "#nowhere")).toThrow(/mount_target_missing/);
    });

    it("reuses the server-rendered nodes and binds signals, listeners, and properties", () =>
    {
        const count = signal(1);
        const title = signal("t");
        const clicks: number[] = [];
        const view = () => html`<section title=${title}><p>Count: ${count}</p><button @click=${() => clicks.push(1)} .tabIndex=${3}>+</button></section>`;

        const el = serverThenClient(view());
        const section = el.querySelector("section") as HTMLElement;
        const text = el.querySelector("p")?.lastChild?.previousSibling;
        expect(result?.mismatches).toEqual([]);

        count.set(2);
        title.set("u");
        expect(el.querySelector("section")).toBe(section);
        expect(el.querySelector("p")?.textContent).toBe("Count: 2");
        expect(el.querySelector("p")?.lastChild?.previousSibling).toBe(text);
        expect(section.getAttribute("title")).toBe("u");
        expect(el.querySelector("button")?.tabIndex).toBe(3);
        el.querySelector("button")?.click();
        expect(clicks).toEqual([1]);
    });

    it("adopts keyed rows and conditional branches and keeps updating them", () =>
    {
        const items = signal([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
        const show = signal(true);
        const view = () => html`
            <ul>${each(items, (item) => item.id, (item) => html`<li>${computed(() => item.get().name)}</li>`)}</ul>
            ${when(show, () => html`<p>shown</p>`, () => html`<p>hidden</p>`)}`;

        const el = serverThenClient(view());
        expect(result?.mismatches).toEqual([]);
        const [first, second] = Array.from(el.querySelectorAll("li"));
        expect(el.querySelector("p")?.textContent).toBe("shown");

        items.set([{ id: 2, name: "B" }, { id: 1, name: "a" }, { id: 3, name: "c" }]);
        const after = Array.from(el.querySelectorAll("li"));
        expect(after.map((li) => li.textContent)).toEqual(["B", "a", "c"]);
        expect(after[0]).toBe(second);
        expect(after[1]).toBe(first);

        show.set(false);
        expect(el.querySelector("p")?.textContent).toBe("hidden");
    });

    it("repairs a differing text node and records the mismatch", () =>
    {
        const seen: Diagnostic[] = [];
        const off = onDiagnostic((d) => seen.push(d));
        const el = serverThenClient(html`<p>${"server"}</p>`, html`<p>${"client"}</p>`);
        off();
        expect(el.querySelector("p")?.textContent).toBe("client");
        expect(result?.mismatches).toEqual([{ kind: "text", expected: "client", found: "server" }]);
        expect(seen.map((d) => d.code)).toEqual(["hydration_mismatch"]);
    });

    it("repairs a structural difference by rendering that part on the client", () =>
    {
        const el = serverThenClient(html`<div>${html`<i>old</i>`}</div>`, html`<div>${html`<b>new</b>`}</div>`);
        expect(el.querySelector("div")?.innerHTML.replace(/<!--[^>]*-->/g, "")).toBe("<b>new</b>");
        expect(result?.mismatches.map((m) => m.kind)).toEqual(["structure"]);
    });

    it("falls back to rendering when the container has no server markup", () =>
    {
        host = document.createElement("div");
        host.innerHTML = "<p>static</p>";
        document.body.append(host);
        result = hydrate(html`<span>fresh</span>`, host);
        expect(host.querySelector("span")?.textContent).toBe("fresh");
        expect(result.mismatches.map((m) => m.kind)).toEqual(["root"]);
    });

    it("disposes everything it bound", () =>
    {
        const count = signal(0);
        const runs = vi.fn();
        const el = serverThenClient(html`<p>${computed(() =>
        {
            runs();
            return count.get();
        })}</p>`);
        const calls = runs.mock.calls.length;
        result?.dispose();
        result = undefined;
        count.set(1);
        expect(runs).toHaveBeenCalledTimes(calls);
        expect(el.querySelector("p")).toBeNull();
    });
});
