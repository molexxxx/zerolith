import { afterEach, describe, expect, it } from "vitest";
import { type Diagnostic, computed, effect, html, onDiagnostic, onDispose, signal } from "zerolith";
import { define } from "zerolith/element";
import { renderToString } from "zerolith/ssr";

let host: HTMLElement | undefined;

afterEach(() =>
{
    host?.remove();
});

define("zl-greeting", {
    props: ["name", "count"],
    view: ({ name, count }, element) => html`<p>Hello ${computed(() => name.get() ?? "stranger")}, ${computed(() => (count.get() as number | undefined) ?? 0)}</p><button @click=${() => element.dispatchEvent(new CustomEvent("wave"))}>Wave</button>`
});

describe("define", () =>
{
    it("renders a view inside a custom element and feeds attributes and properties into its signals", () =>
    {
        host = document.createElement("div");
        host.innerHTML = "<zl-greeting name=\"Ada\"></zl-greeting>";
        document.body.append(host);
        const element = host.firstElementChild as HTMLElement & { name: unknown; count: unknown };
        expect(element.querySelector("p")?.textContent).toBe("Hello Ada, 0");

        element.setAttribute("name", "Grace");
        expect(element.querySelector("p")?.textContent).toBe("Hello Grace, 0");
        element.count = 3;
        expect(element.querySelector("p")?.textContent).toBe("Hello Grace, 3");
        expect(element.name).toBe("Grace");
        element.removeAttribute("name");
        expect(element.querySelector("p")?.textContent).toBe("Hello stranger, 3");

        let waves = 0;
        element.addEventListener("wave", () =>
        {
            waves += 1;
        });
        element.querySelector("button")?.click();
        expect(waves).toBe(1);

        element.remove();
        expect(element.querySelector("p")).toBeNull();
    });

    it("keeps a property assigned before upgrade and hydrates server-rendered content", () =>
    {
        const early = document.createElement("zl-later") as HTMLElement & { label: unknown };
        early.label = "early";
        define("zl-later", { props: ["label"], view: ({ label }) => html`<b>${label}</b>` });
        host = document.createElement("div");
        host.append(early);
        document.body.append(host);
        expect(early.querySelector("b")?.textContent).toBe("early");

        const template = document.createElement("template");
        template.innerHTML = "<zl-later label=\"server\"></zl-later>";
        const element = template.content.firstElementChild as HTMLElement;
        element.innerHTML = renderToString(html`<b>${"server"}</b>`);
        const server = element.querySelector("b");
        expect(customElements.get("zl-later")).toBeDefined();
        expect(element.matches(":defined")).toBe(false);
        const rendered = document.createElement("div");
        rendered.append(element);
        host.append(rendered);
        expect(element.matches(":defined")).toBe(true);
        expect(element.querySelectorAll("b")).toHaveLength(1);
        expect(element.querySelector("b")).toBe(server);
        expect(element.querySelector("b")?.textContent).toBe("server");
    });

    it("replaces whatever the element held, which the view can still read as it runs", () =>
    {
        let readDuringView = "";
        define("zl-fallback", {
            props: [],
            view: (_props, element) =>
            {
                readDuringView = element.textContent;
                return html`<p>ready</p>`;
            }
        });
        host = document.createElement("div");
        host.innerHTML = "<zl-fallback>Loading the app</zl-fallback>";
        document.body.append(host);
        const element = host.firstElementChild as HTMLElement;
        expect(readDuringView).toBe("Loading the app");
        expect(element.textContent).toBe("ready");
        expect(element.querySelectorAll("p")).toHaveLength(1);

        const moved = document.createElement("section");
        host.append(moved);
        moved.append(element);
        expect(element.textContent).toBe("ready");
        element.remove();
        element.append("Added while away");
        moved.append(element);
        expect(element.textContent).toBe("ready");
    });

    it("keeps a node the view moved into its own content, and what it held when the view throws", () =>
    {
        define("zl-framed", {
            props: [],
            view: (_props, element) =>
            {
                const box = document.createElement("section");
                box.append(element.querySelector("em") as HTMLElement);
                return html`<div>${element.querySelector("b")}</div>${box}`;
            }
        });
        define("zl-broken", {
            props: [],
            view: () =>
            {
                throw new Error("the view failed");
            }
        });
        host = document.createElement("div");
        document.body.append(host);
        const framed = document.createElement("zl-framed");
        framed.innerHTML = "<b>kept</b><em>moved</em><i>dropped</i>";
        host.append(framed);
        expect(framed.querySelector("div > b")?.textContent).toBe("kept");
        expect(framed.querySelector("section > em")?.textContent).toBe("moved");
        expect(framed.querySelector("i")).toBeNull();

        const broken = document.createElement("zl-broken");
        broken.textContent = "Still here";
        const failures: unknown[] = [];
        const onError = (event: ErrorEvent): void =>
        {
            failures.push(event.message);
            event.preventDefault();
        };
        window.addEventListener("error", onError);
        host.append(broken);
        window.removeEventListener("error", onError);
        expect(failures).toHaveLength(1);
        expect(broken.textContent).toBe("Still here");
    });

    it("drops what the parser adds after a script ran before the page finished parsing, and leaves the view's own updates", () =>
    {
        const label = signal("first");
        define("zl-parsed", { props: [], view: () => html`<p>${label}</p>` });
        host = document.createElement("div");
        document.body.append(host);
        const element = document.createElement("zl-parsed");
        const early = document.createElement("zl-parsed");
        Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });
        try
        {
            host.append(element, early);
        }
        finally
        {
            delete (document as unknown as { readyState?: string }).readyState;
        }
        expect(element.textContent).toBe("first");

        element.append("Fallback the parser reached later", document.createElement("hr"));
        early.remove();
        host.append(early);
        early.append("Added by the page after it moved");
        document.dispatchEvent(new Event("DOMContentLoaded"));
        expect(element.textContent).toBe("first");
        expect(element.querySelector("hr")).toBeNull();
        expect(early.textContent).toContain("Added by the page after it moved");

        label.set("second");
        expect(element.textContent).toBe("second");
        element.append("Added by the page after it loaded");
        document.dispatchEvent(new Event("DOMContentLoaded"));
        expect(element.textContent).toContain("Added by the page after it loaded");
    });

    it("ends the effects and cleanups its view registers when it disconnects", () =>
    {
        const tick = signal(0);
        let runs = 0;
        let cleanups = 0;
        define("zl-owned", {
            props: [],
            view: () =>
            {
                effect(() =>
                {
                    tick.get();
                    runs++;
                });
                onDispose(() => { cleanups++; });
                return html`<p>owned</p>`;
            }
        });
        host = document.createElement("div");
        document.body.append(host);
        const element = document.createElement("zl-owned");
        host.append(element);
        expect(element.querySelector("p")?.textContent).toBe("owned");
        expect(runs).toBe(1);

        element.remove();
        expect(cleanups).toBe(1);
        tick.set(1);
        expect(runs).toBe(1);
    });

    it("renders an element created or moved on the client without reporting a mismatch", () =>
    {
        const seen: Diagnostic[] = [];
        const off = onDiagnostic((d) => seen.push(d));
        host = document.createElement("div");
        document.body.append(host);
        const element = document.createElement("zl-greeting");
        element.setAttribute("name", "Ada");
        host.append(element);
        const other = document.createElement("section");
        host.append(other);
        other.append(element);
        off();
        expect(element.querySelector("p")?.textContent).toBe("Hello Ada, 0");
        expect(seen).toEqual([]);
    });

    it("feeds a prop named like a native property into its signal, replacing the native one", () =>
    {
        define("zl-titled", {
            props: ["title"],
            view: ({ title }) => html`<span>${computed(() => `${String(title.get() ?? "none")}`)}</span>`
        });
        const element = document.createElement("zl-titled");
        document.body.append(element);
        element.setAttribute("title", "from attribute");
        expect(element.querySelector("span")?.textContent).toBe("from attribute");
        (element as HTMLElement & { title: unknown }).title = "from property";
        expect(element.querySelector("span")?.textContent).toBe("from property");
        expect(element.getAttribute("title")).toBe("from attribute");
        element.remove();
    });

    it("ignores a second definition of the same name", () =>
    {
        define("zl-greeting", { props: [], view: () => html`<i>other</i>` });
        host = document.createElement("div");
        host.innerHTML = "<zl-greeting></zl-greeting>";
        document.body.append(host);
        expect(host.querySelector("p")?.textContent).toBe("Hello stranger, 0");
    });
});
