import { afterEach, describe, expect, it, vi } from "vitest";
import { type Diagnostic, type HydrateResult, type Renderable, type Signal, computed, context, each, html, hydrate, onDiagnostic, signal, unsafeHtml, when } from "zerolith";
import { renderToString } from "zerolith/ssr";
import { withoutComments } from "./markup.js";

let host: HTMLElement | undefined;
let result: HydrateResult | undefined;

/** Server-renders `view` into a fresh host, then hydrates `clientView` (the same view by default) into it. */
function serverThenClient(view: Renderable | (() => Renderable), clientView: Renderable | (() => Renderable) = view): HTMLElement
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

    it("gives adopted rows and branches the value provided around the view", () =>
    {
        const user = context("guest");
        const page = (): Renderable => html`<ul>${each([1], (row) => row, () => html`<li>${user.read()}</li>`)}</ul>${when(true, () => html`<p>${user.read()}</p>`)}`;
        const el = serverThenClient(() => user.provide("ada", page));
        expect(result?.mismatches).toEqual([]);
        expect([el.querySelector("li")?.textContent, el.querySelector("p")?.textContent]).toEqual(["ada", "ada"]);
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

    it("keeps the server's markers around an adopted only child, adds none to rows the client creates, and updates both", () =>
    {
        const items = signal([{ id: 1, name: "a" }]);
        const view = () => html`<ul>${each(items, (item) => item.id, (item) => html`<li>${computed(() => item.get().name)}</li>`)}</ul>`;

        const el = serverThenClient(view());
        expect(result?.mismatches).toEqual([]);
        const adopted = el.querySelector("li") as HTMLLIElement;
        const served = adopted.childNodes.length;
        expect(served).toBeGreaterThan(1);

        items.set([{ id: 1, name: "A" }, { id: 2, name: "b" }]);
        const created = el.querySelectorAll("li")[1] as HTMLLIElement;
        expect(adopted.textContent).toBe("A");
        expect(adopted.childNodes.length).toBe(served);
        expect(created.textContent).toBe("b");
        expect(created.childNodes.length).toBe(1);

        items.set([{ id: 1, name: "A" }, { id: 2, name: "B" }]);
        expect(created.textContent).toBe("B");
        expect(withoutComments(el.innerHTML)).toBe("<ul><li>A</li><li>B</li></ul>");
    });

    it("removes an adopted branch's edge bindings with the branch", () =>
    {
        const show = signal(true);
        const greeting = signal<unknown>("hi");
        const items = signal([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
        const view = () => html`
            <div id="branch">${when(show, () => html`${greeting}<b>!</b>${greeting}`, () => html`<i>off</i>`)}</div>
            <div id="rows">${each(items, (item) => item.id, (item) => html`${computed(() => item.get().name)}<hr>`)}</div>`;

        const el = serverThenClient(view());
        expect(result?.mismatches).toEqual([]);
        const branch = el.querySelector("#branch") as HTMLElement;
        const rows = el.querySelector("#rows") as HTMLElement;
        expect(branch.textContent).toBe("hi!hi");
        expect(rows.textContent).toBe("ab");

        greeting.set(html`<em>yo</em>`);
        expect(branch.textContent).toBe("yo!yo");
        show.set(false);
        expect(branch.textContent).toBe("off");

        items.set([{ id: 3, name: "c" }, { id: 2, name: "b" }]);
        expect(rows.textContent).toBe("cb");
        items.set([{ id: 2, name: "b" }]);
        expect(rows.textContent).toBe("b");
        expect(rows.querySelectorAll("hr")).toHaveLength(1);
    });

    it("adopts a template once and updates it as a client template after", () =>
    {
        const x = signal("a");
        const view = () => html`<div>${computed(() => html`<b>${x.get()}</b>`)}</div>`;
        const el = serverThenClient(view());
        const bold = el.querySelector("b");
        const seen: Diagnostic[] = [];
        const off = onDiagnostic((d) => seen.push(d));
        x.set("b");
        x.set("c");
        off();
        expect(el.querySelector("b")).toBe(bold);
        expect(bold?.textContent).toBe("c");
        expect(seen).toEqual([]);
        expect(result?.mismatches).toEqual([]);
    });

    it("hydrates an empty string without a mismatch and keeps updating it", () =>
    {
        const message = signal("");
        const el = serverThenClient(html`<p>${""}</p><span>${message}</span>`);
        expect(result?.mismatches).toEqual([]);
        message.set("saved");
        expect(el.querySelector("span")?.textContent).toBe("saved");
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

    it("renders every row when the server markup holds none of them, and keeps updating them", () =>
    {
        type Item = { id: number; name: string };
        const view = (items: Signal<Item[]>) => html`<ul>${when(computed(() => items.get().length === 0), () => "Loading", () => each(items, (item) => item.id, (item) => html`<li>${computed(() => item.get().name)}</li>`))}</ul>`;
        const items = signal<Item[]>([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
        const el = serverThenClient(view(signal<Item[]>([])), view(items));
        const names = (): (string | null)[] => Array.from(el.querySelectorAll("li"), (li) => li.textContent);
        expect(names()).toEqual(["a", "b"]);
        expect(el.querySelector("ul")?.textContent).toBe("ab");

        items.set([...items.get(), { id: 3, name: "c" }]);
        expect(names()).toEqual(["a", "b", "c"]);
    });

    it("renders every item of an array hydrated over server text", () =>
    {
        const el = serverThenClient(html`<p>${"server"}</p>`, html`<p>${["x", "y"]}</p>`);
        expect(el.querySelector("p")?.textContent).toBe("xy");
    });

    it("repairs a node bound as content with a structure mismatch, and reports missing and extra nodes by kind", () =>
    {
        const strong = document.createElement("strong");
        strong.textContent = "node";
        const el = serverThenClient(html`<p>${"server"}</p>`, html`<p>${strong}</p>`);
        expect(el.querySelector("strong")).toBe(strong);
        expect(el.querySelector("p")?.textContent).toBe("node");
        expect(result?.mismatches.map((m) => m.kind)).toEqual(["structure"]);
        result?.dispose();
        const items = serverThenClient(html`<p>${["a"]}</p>`, html`<p>${["a", "b"]}</p>`);
        expect(items.querySelector("p")?.textContent).toBe("ab");
        expect(result?.mismatches.map((m) => m.kind)).toEqual(["missing"]);
        result?.dispose();
        serverThenClient(html`<p>${["a", "b"]}</p>`, html`<p>${["a"]}</p>`);
        expect(result?.mismatches.map((m) => m.kind)).toEqual(["extra"]);
    });

    it("adopts raw markup the server wrote and keeps it", () =>
    {
        const el = serverThenClient(html`<div>${unsafeHtml("<i>raw</i>")}</div>`);
        expect(el.querySelector("i")?.textContent).toBe("raw");
        expect(result?.mismatches).toEqual([]);
    });

    it("repairs a structural difference by rendering that part on the client", () =>
    {
        const el = serverThenClient(html`<div>${html`<i>old</i>`}</div>`, html`<div>${html`<b>new</b>`}</div>`);
        expect(withoutComments(el.querySelector("div")?.innerHTML ?? "")).toBe("<b>new</b>");
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
