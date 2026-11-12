import { afterEach, describe, expect, it } from "vitest";
import { type Diagnostic, computed, each, effect, html, onDiagnostic, onDispose, render, signal } from "zerolith";
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

    it("gives the view what the tag held as children, beside its props, to bind where it belongs", () =>
    {
        define("zl-card", {
            props: ["heading"],
            view: ({ heading, children }) => html`<h2>${heading}</h2><div>${children}</div>`
        });
        host = document.createElement("div");
        host.innerHTML = "<zl-card heading=\"Drafts\">Two <b>notes</b></zl-card>";
        document.body.append(host);
        const element = host.firstElementChild as HTMLElement;
        const bold = element.querySelector("b");
        const body = (): HTMLElement => element.querySelector("div") as HTMLElement;
        expect(element.querySelector("h2")?.textContent).toBe("Drafts");
        expect(body().textContent).toBe("Two notes");
        expect(body().querySelector("b")).toBe(bold);
        expect([...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE)).toEqual([]);

        const moved = document.createElement("section");
        host.append(moved);
        moved.append(element);
        expect(element.querySelectorAll("div")).toHaveLength(1);
        expect(body().textContent).toBe("Two notes");
        expect(body().querySelector("b")).toBe(bold);

        element.remove();
        element.append("Replaced");
        moved.append(element);
        expect(body().textContent).toBe("Replaced");
    });

    it("types children as nodes, and lets a prop take the name", () =>
    {
        let held: readonly Node[] = [];
        define("zl-typed", {
            props: [],
            view: ({ children }) =>
            {
                held = children.get();
                return html`<p>typed</p>`;
            }
        });
        define("zl-named", { props: ["children"], view: ({ children }) => html`<p>${children}</p>` });
        host = document.createElement("div");
        host.innerHTML = "<zl-typed>Held</zl-typed><zl-named children=\"From the attribute\">From the tag</zl-named>";
        document.body.append(host);
        expect(held.map((node) => node.textContent)).toEqual(["Held"]);
        expect(host.querySelector("zl-typed")?.textContent).toBe("typed");
        expect(host.querySelector("zl-named")?.textContent).toBe("From the attribute");
    });

    it("hydrates server markup with no children, and no second copy of it", () =>
    {
        let count = -1;
        define("zl-hydrated-children", {
            props: [],
            view: ({ children }) =>
            {
                count = children.get().length;
                return html`<b>${"served"}</b>`;
            }
        });
        const template = document.createElement("template");
        template.innerHTML = "<zl-hydrated-children></zl-hydrated-children>";
        const element = template.content.firstElementChild as HTMLElement;
        element.innerHTML = renderToString(html`<b>${"served"}</b>`);
        host = document.createElement("div");
        host.append(element);
        document.body.append(host);
        expect(count).toBe(0);
        expect(element.querySelectorAll("b")).toHaveLength(1);
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

    it("gives the view what the parser adds to the tag after a script ran before the page finished parsing", () =>
    {
        define("zl-parsed-card", { props: [], view: ({ children }) => html`<div>${children}</div>` });
        host = document.createElement("div");
        document.body.append(host);
        const element = document.createElement("zl-parsed-card");
        element.append("First ");
        Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });
        try
        {
            host.append(element);
        }
        finally
        {
            delete (document as unknown as { readyState?: string }).readyState;
        }
        const body = element.querySelector("div") as HTMLElement;
        expect(body.textContent).toBe("First ");
        const strong = document.createElement("strong");
        strong.textContent = "second";
        element.append(strong, " third");
        document.dispatchEvent(new Event("DOMContentLoaded"));
        expect(body.textContent).toBe("First second third");
        expect(body.querySelector("strong")).toBe(strong);
        expect(element.childElementCount).toBe(1);
    });

    it("keeps the rows another view added to its children since it connected when it moves", () =>
    {
        const items = signal(["a"]);
        define("zl-rows", { props: [], view: ({ children }) => html`<ul>${children}</ul>` });
        host = document.createElement("div");
        document.body.append(host);
        const root = render(html`<zl-rows>${each(items, (item) => item, (item) => html`<li>${item}</li>`)}</zl-rows>`, host);
        const element = host.querySelector("zl-rows") as HTMLElement;
        items.set(["a", "b"]);
        const added = element.querySelectorAll("li")[1];
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(element);
        expect(element.querySelector("ul")?.textContent).toBe("ab");
        expect(element.querySelectorAll("li")[1]).toBe(added);
        items.set(["a", "b", "c"]);
        expect(element.querySelector("ul")?.textContent).toBe("abc");
        items.set(["c"]);
        expect(element.querySelector("ul")?.textContent).toBe("c");
        root.dispose();
    });

    it("leaves an effect that moves it unsubscribed from what it holds", () =>
    {
        define("zl-moved", { props: [], view: ({ children }) => html`<p>${children}</p>` });
        host = document.createElement("div");
        document.body.append(host);
        const element = document.createElement("zl-moved");
        element.append("first");
        host.append(element);
        const other = document.createElement("section");
        host.append(other);
        let runs = 0;
        const stop = effect(() =>
        {
            runs += 1;
            other.append(element);
        });
        element.remove();
        element.append("second");
        host.append(element);
        stop();
        expect([runs, element.textContent]).toEqual([1, "second"]);
    });

    it("keeps what the tag held when the content its view returns fails to render", () =>
    {
        define("zl-unrenderable", { props: [], view: () => html`<p>${{ not: "renderable" } as unknown as string}</p>` });
        host = document.createElement("div");
        document.body.append(host);
        const element = document.createElement("zl-unrenderable");
        element.append("Fallback", document.createElement("hr"));
        const held = [...element.childNodes];
        const failures: unknown[] = [];
        const onError = (event: ErrorEvent): void =>
        {
            failures.push(event.error);
            event.preventDefault();
        };
        window.addEventListener("error", onError);
        host.append(element);
        window.removeEventListener("error", onError);
        expect(failures).toHaveLength(1);
        expect([...element.childNodes]).toEqual(held);
    });

    it("stops waiting for the page to finish parsing when it disconnects first", () =>
    {
        define("zl-brief", { props: [], view: () => html`<p>x</p>` });
        host = document.createElement("div");
        document.body.append(host);
        const listening = new Set<unknown>();
        const add = document.addEventListener.bind(document);
        const remove = document.removeEventListener.bind(document);
        document.addEventListener = ((type: string, listener: EventListener, options?: AddEventListenerOptions) =>
        {
            if (type === "DOMContentLoaded")
            {
                listening.add(listener);
            }
            add(type, listener, options);
        }) as typeof document.addEventListener;
        document.removeEventListener = ((type: string, listener: EventListener, options?: EventListenerOptions) =>
        {
            if (type === "DOMContentLoaded")
            {
                listening.delete(listener);
            }
            remove(type, listener, options);
        }) as typeof document.removeEventListener;
        Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });
        try
        {
            for (let made = 0; made < 3; made += 1)
            {
                const element = document.createElement("zl-brief");
                host.append(element);
                element.remove();
            }
        }
        finally
        {
            delete (document as unknown as { readyState?: string }).readyState;
            delete (document as unknown as { addEventListener?: unknown }).addEventListener;
            delete (document as unknown as { removeEventListener?: unknown }).removeEventListener;
        }
        expect(listening.size).toBe(0);
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
