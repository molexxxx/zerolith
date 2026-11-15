import { afterEach, describe, expect, it } from "vitest";
import { type Diagnostic, computed, context, each, effect, html, onDiagnostic, onDispose, render, signal, when } from "zerolith";
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

const theme = context("light");

define("zl-themed", { props: [], view: () => html`<b>${theme.read()}</b>` });

describe("define", () =>
{
    it("gives an element the values provided around the template that creates it, now and in rows added later", () =>
    {
        const rows = signal([1]);
        host = document.createElement("div");
        document.body.append(host);
        const root = render(() => theme.provide("dark", () => html`<zl-themed></zl-themed><ul>${each(rows, (row) => row, () => html`<li><zl-themed></zl-themed></li>`)}</ul>`), host);
        rows.set([1, 2]);
        expect([...host.querySelectorAll("zl-themed")].map((element) => element.textContent)).toEqual(["dark", "dark", "dark"]);
        const parsed = document.createElement("div");
        parsed.innerHTML = "<zl-themed></zl-themed>";
        host.append(parsed);
        expect(parsed.textContent).toBe("light");
        root.dispose();
    });

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

    it("shows the children a view binds directly under the element", () =>
    {
        define("zl-headed", { props: [], view: ({ children }) => html`<h2>Title</h2>${children}` });
        define("zl-passed", { props: [], view: ({ children }) => html`${children}` });
        host = document.createElement("div");
        document.body.append(host);
        host.innerHTML = "<zl-headed><p>body</p></zl-headed><zl-passed><p>whole</p></zl-passed>";
        const [headed, passed] = [...host.children] as HTMLElement[];
        expect(headed?.textContent).toBe("Titlebody");
        expect(passed?.textContent).toBe("whole");
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(headed as HTMLElement);
        expect(headed?.textContent).toBe("Titlebody");
    });

    it("keeps the rows of a list bound directly under the element when it moves", () =>
    {
        const items = signal(["a"]);
        define("zl-headed-rows", { props: [], view: ({ children }) => html`<h2>Title</h2>${children}` });
        host = document.createElement("div");
        document.body.append(host);
        const root = render(html`<zl-headed-rows>${each(items, (item) => item, (item) => html`<li>${item}</li>`)}</zl-headed-rows>`, host);
        const element = host.querySelector("zl-headed-rows") as HTMLElement;
        items.set(["a", "b"]);
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(element);
        expect(element.textContent).toBe("Titleab");
        expect(element.querySelectorAll("h2")).toHaveLength(1);
        items.set(["a", "b", "c"]);
        expect(element.textContent).toBe("Titleabc");
        host.append(element);
        items.set(["c"]);
        expect(element.textContent).toBe("Titlec");
        root.dispose();
    });

    it("follows rows another view put first, removed, or added to an empty list before it moves", () =>
    {
        const items = signal(["a", "b"]);
        const late = signal<string[]>([]);
        define("zl-edited-rows", { props: [], view: ({ children }) => html`<ul>${children}</ul>` });
        host = document.createElement("div");
        document.body.append(host);
        const root = render(html`<zl-edited-rows>${each(items, (item) => item, (item) => html`<li>${item}</li>`)}</zl-edited-rows><zl-edited-rows>${each(late, (item) => item, (item) => html`<li>${item}</li>`)}</zl-edited-rows>`, host);
        const [edited, filled] = [...host.querySelectorAll("zl-edited-rows")] as HTMLElement[];
        items.set(["z", "b", "c"]);
        late.set(["first"]);
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(edited as HTMLElement, filled as HTMLElement);
        expect(edited?.querySelector("ul")?.textContent).toBe("zbc");
        expect(filled?.querySelector("ul")?.textContent).toBe("first");
        items.set(["c", "z", "b"]);
        items.set(["c", "b"]);
        late.set(["first", "second"]);
        host.append(edited as HTMLElement, filled as HTMLElement);
        expect(edited?.querySelector("ul")?.textContent).toBe("cb");
        expect(filled?.querySelector("ul")?.textContent).toBe("firstsecond");
        items.set(["b"]);
        expect(edited?.querySelector("ul")?.textContent).toBe("b");
        root.dispose();
    });

    it("keeps the rows a list added while the page was still parsing, and after, when it moves", () =>
    {
        const items = signal(["a"]);
        define("zl-parsed-rows", { props: [], view: ({ children }) => html`<ul>${children}</ul>` });
        host = document.createElement("div");
        document.body.append(host);
        let root: { dispose(): void } | undefined;
        Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });
        try
        {
            root = render(html`<zl-parsed-rows>${each(items, (item) => item, (item) => html`<li>${item}</li>`)}</zl-parsed-rows>`, host);
        }
        finally
        {
            delete (document as unknown as { readyState?: string }).readyState;
        }
        const element = host.querySelector("zl-parsed-rows") as HTMLElement;
        items.set(["a", "b"]);
        const tail = document.createElement("li");
        tail.textContent = "tail";
        element.append(tail);
        document.dispatchEvent(new Event("DOMContentLoaded"));
        expect(element.querySelector("ul")?.textContent).toBe("abtail");
        items.set(["a", "b", "c"]);
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(element);
        expect(element.querySelector("ul")?.textContent).toBe("abctail");
        expect(element.querySelectorAll("li")).toHaveLength(4);
        root?.dispose();
    });

    it("keeps the view's own nodes out of children through every move", () =>
    {
        const seen: (readonly Node[])[] = [];
        define("zl-listed", {
            props: [],
            view: ({ children }) =>
            {
                seen.push(children.get());
                return html`<ul>${children}</ul>`;
            }
        });
        define("zl-split", {
            props: [],
            view: ({ children }) => html`<div>${computed(() => children.get().slice(0, 1))}<hr>${computed(() => children.get().slice(1))}</div>`
        });
        define("zl-framed-body", {
            props: [],
            view: ({ children }) => html`<article>${computed(() => children.get().slice(0, 1))}<div class="body">${computed(() => children.get().slice(1, -1))}</div>${computed(() => children.get().slice(-1))}</article>`
        });
        host = document.createElement("div");
        document.body.append(host);
        host.innerHTML = "<zl-listed><li>a</li><li>b</li><li>c</li></zl-listed><zl-split><b>one</b><i>two</i><u>three</u></zl-split><zl-framed-body><b>one</b><i>two</i><u>three</u></zl-framed-body>";
        const [listed, split, framed] = [...host.children] as HTMLElement[];
        const held = seen[0] as readonly Node[];
        const nodes = listed?.querySelector("ul")?.childNodes.length;
        const moved = document.createElement("section");
        host.append(moved);
        for (let move = 0; move < 4; move++)
        {
            (move % 2 === 0 ? moved : host).append(listed as HTMLElement, split as HTMLElement, framed as HTMLElement);
        }
        expect(seen).toHaveLength(5);
        expect(seen[4]).toHaveLength(3);
        expect(seen[4]?.every((node, index) => node === held[index])).toBe(true);
        expect(listed?.querySelector("ul")?.childNodes.length).toBe(nodes);
        expect(split?.textContent).toBe("onetwothree");
        expect(split?.querySelectorAll("hr")).toHaveLength(1);
        expect(framed?.querySelector(".body")?.textContent).toBe("two");
        expect(framed?.textContent).toBe("onetwothree");
        expect(framed?.querySelectorAll(".body")).toHaveLength(1);
    });

    it("keeps every child through a move after the view rendered them again", () =>
    {
        const open = signal(true);
        const plain = signal(false);
        const seen: (readonly Node[])[] = [];
        define("zl-folding", {
            props: [],
            view: ({ children }) =>
            {
                seen.push(children.get());
                return html`${when(open, () => html`<ul>${children}</ul>`)}`;
            }
        });
        define("zl-filtered", {
            props: [],
            view: ({ children }) => html`<div>${computed(() => plain.get() ? children.get().filter((node) => node.nodeName !== "I") : children.get())}</div>`
        });
        host = document.createElement("div");
        document.body.append(host);
        host.innerHTML = "<zl-folding><li>a</li><li>b</li></zl-folding><zl-filtered><b>one</b><i>two</i><u>three</u></zl-filtered>";
        const [folding, filtered] = [...host.children] as HTMLElement[];
        const held = seen[0] as readonly Node[];
        const moved = document.createElement("section");
        host.append(moved);
        for (let move = 0; move < 3; move++)
        {
            open.set(false);
            open.set(true);
            plain.set(move % 2 === 0);
            (move % 2 === 0 ? moved : host).append(folding as HTMLElement, filtered as HTMLElement);
        }
        expect(seen[3]).toHaveLength(2);
        expect(seen[3]?.every((node, index) => node === held[index])).toBe(true);
        expect(folding?.textContent).toBe("ab");
        expect(filtered?.textContent).toBe("onethree");
        plain.set(false);
        expect(filtered?.textContent).toBe("onetwothree");
        open.set(false);
        moved.append(folding as HTMLElement);
        open.set(true);
        expect(folding?.textContent).toBe("ab");
    });

    it("keeps what the parser added, and nothing of the view's, through a later move", () =>
    {
        const seen: (readonly Node[])[] = [];
        define("zl-parsed-list", {
            props: [],
            view: ({ children }) =>
            {
                seen.push(children.get());
                return html`<div>${children}</div>`;
            }
        });
        host = document.createElement("div");
        document.body.append(host);
        const element = document.createElement("zl-parsed-list");
        const first = document.createElement("b");
        element.append(first);
        Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });
        try
        {
            host.append(element);
        }
        finally
        {
            delete (document as unknown as { readyState?: string }).readyState;
        }
        const second = document.createElement("i");
        const third = document.createElement("u");
        element.append(second, third);
        document.dispatchEvent(new Event("DOMContentLoaded"));
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(element);
        host.append(element);
        expect(seen).toHaveLength(3);
        expect(seen[2]).toHaveLength(3);
        expect(seen[2]?.[0]).toBe(first);
        expect(seen[2]?.[1]).toBe(second);
        expect(seen[2]?.[2]).toBe(third);
        expect(element.querySelector("div")?.childElementCount).toBe(3);
    });

    it("keeps what the tag held through a move when its view throws", () =>
    {
        define("zl-failing", {
            props: [],
            view: () =>
            {
                throw new Error("the view failed");
            }
        });
        host = document.createElement("div");
        document.body.append(host);
        const element = document.createElement("zl-failing");
        element.textContent = "Still here";
        const moved = document.createElement("section");
        host.append(moved);
        const failures: unknown[] = [];
        const onError = (event: ErrorEvent): void =>
        {
            failures.push(event.message);
            event.preventDefault();
        };
        window.addEventListener("error", onError);
        host.append(element);
        moved.append(element);
        host.append(element);
        window.removeEventListener("error", onError);
        expect(failures).toHaveLength(3);
        expect(element.textContent).toBe("Still here");
    });

    it("takes a prop named show, or place, as any other name", () =>
    {
        define("zl-shown", { props: ["show", "place"], view: ({ show, place, children }) => html`<p>${show} ${place} ${children}</p>` });
        host = document.createElement("div");
        document.body.append(host);
        host.innerHTML = "<zl-shown show=\"yes\" place=\"top\">body</zl-shown>";
        const element = host.firstElementChild as HTMLElement & { show: unknown; place: unknown };
        expect(element.querySelector("p")?.textContent).toBe("yes top body");
        element.show = "no";
        element.place = "left";
        expect(element.querySelector("p")?.textContent).toBe("no left body");
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(element);
        expect(element.querySelector("p")?.textContent).toBe("no left body");
    });

    it("keeps a child its view shows on its own through a move made while it shows something else", () =>
    {
        const open = signal(true);
        define("zl-single", { props: [], view: ({ children }) => html`<div>${computed(() => open.get() ? children.get()[0] : "closed")}</div>` });
        host = document.createElement("div");
        document.body.append(host);
        host.innerHTML = "<zl-single><span>x</span></zl-single>";
        const element = host.firstElementChild as HTMLElement;
        const span = element.querySelector("span");
        open.set(false);
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(element);
        expect(element.textContent).toBe("closed");
        open.set(true);
        expect(element.querySelector("span")).toBe(span);
        expect(element.textContent).toBe("x");
    });

    it("lets go of a child taken out of the page, and keeps them all while one sits somewhere else", () =>
    {
        define("zl-kept-rows", { props: [], view: ({ children }) => html`<ul>${children}</ul>` });
        host = document.createElement("div");
        document.body.append(host);
        host.innerHTML = "<zl-kept-rows><li>a</li><li>b</li><li>c</li></zl-kept-rows><zl-kept-rows><li>a</li><li>b</li><li>c</li></zl-kept-rows>";
        const [taken, parked] = [...host.children] as HTMLElement[];
        taken?.querySelectorAll("li")[2]?.remove();
        const second = parked?.querySelectorAll("li")[1] as HTMLElement;
        const elsewhere = document.createElement("ol");
        host.append(elsewhere);
        elsewhere.append(second);
        parked?.querySelectorAll("li")[1]?.remove();
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(taken as HTMLElement, parked as HTMLElement);
        expect(taken?.querySelector("ul")?.textContent).toBe("ab");
        expect(parked?.querySelector("ul")?.textContent).toBe("abc");
        expect(parked?.querySelectorAll("li")[1]).toBe(second);
    });

    it("keeps a child its view shows in a second place through every move", () =>
    {
        const open = signal(true);
        const seen: (readonly Node[])[] = [];
        define("zl-footed", {
            props: [],
            view: ({ children }) =>
            {
                seen.push(children.get());
                return html`<main>${children}</main><footer>${computed(() => children.get().slice(-1))}</footer>`;
            }
        });
        define("zl-collapsing", {
            props: [],
            view: ({ children }) => html`${when(open, () => html`<ul>${children}</ul>`, () => html`<p>${computed(() => children.get().slice(0, 1))}</p>`)}`
        });
        define("zl-ruled", {
            props: [],
            view: ({ children }) => html`<div>${children}<hr>${computed(() => children.get().slice(-1))}</div>`
        });
        define("zl-sorted", { props: [], view: ({ children }) => html`<ul>${children}</ul>` });
        host = document.createElement("div");
        document.body.append(host);
        host.innerHTML = "<zl-footed><b>one</b><i>two</i><u>three</u></zl-footed><zl-collapsing><li>a</li><li>b</li></zl-collapsing><zl-ruled><b>one</b><i>two</i><u>three</u></zl-ruled><zl-sorted><li>a</li><li>b</li></zl-sorted>";
        const [footed, collapsing, ruled, sorted] = [...host.children] as HTMLElement[];
        const held = seen[0] as readonly Node[];
        open.set(false);
        const list = sorted?.querySelector("ul") as HTMLElement;
        list.appendChild(list.firstElementChild as HTMLElement);
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(footed as HTMLElement, collapsing as HTMLElement, ruled as HTMLElement, sorted as HTMLElement);
        host.append(footed as HTMLElement, collapsing as HTMLElement, ruled as HTMLElement, sorted as HTMLElement);
        expect(ruled?.textContent).toBe("onetwothree");
        expect(ruled?.querySelectorAll("hr")).toHaveLength(1);
        expect(sorted?.querySelectorAll("li")).toHaveLength(2);
        expect(seen[2]).toHaveLength(3);
        expect(seen[2]?.every((node, index) => node === held[index])).toBe(true);
        expect(footed?.querySelector("main")?.textContent).toBe("onetwo");
        expect(footed?.querySelector("footer")?.textContent).toBe("three");
        expect(collapsing?.textContent).toBe("a");
        open.set(true);
        expect(collapsing?.querySelector("ul")?.textContent).toBe("ab");
    });

    it("keeps every child when the place its view bound them whole is no longer shown", () =>
    {
        const wide = signal(true);
        const expanded = signal(false);
        const seen: (readonly Node[])[] = [];
        define("zl-narrowing", {
            props: [],
            view: ({ children }) =>
            {
                seen.push(children.get());
                return html`${when(wide, () => html`<ul>${children}</ul>`, () => html`<nav>${when(expanded, () => computed(() => children.get().filter((node) => node.nodeType === 1)))}</nav>`)}`;
            }
        });
        host = document.createElement("div");
        document.body.append(host);
        host.innerHTML = "<zl-narrowing><li>a</li><li>b</li></zl-narrowing>";
        const element = host.firstElementChild as HTMLElement;
        const held = seen[0] as readonly Node[];
        wide.set(false);
        expanded.set(true);
        expanded.set(false);
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(element);
        expect(seen[1]).toHaveLength(2);
        expect(seen[1]?.every((node, index) => node === held[index])).toBe(true);
        expanded.set(true);
        expect(element.querySelector("nav")?.textContent).toBe("ab");
    });

    it("keeps the same children through every move when its view forwards them to another element", () =>
    {
        const seen: (readonly Node[])[] = [];
        define("zl-forwarded-to", { props: [], view: ({ children }) => html`<section>${children}</section>` });
        define("zl-forwarding", {
            props: [],
            view: ({ children }) =>
            {
                seen.push(children.get());
                return html`<zl-forwarded-to>${children}</zl-forwarded-to>`;
            }
        });
        host = document.createElement("div");
        document.body.append(host);
        host.innerHTML = "<zl-forwarding><b>1</b><i>2</i></zl-forwarding>";
        const element = host.firstElementChild as HTMLElement;
        const held = seen[0] as readonly Node[];
        const nodes = element.querySelector("section")?.childNodes.length;
        const moved = document.createElement("section");
        host.append(moved);
        for (let move = 0; move < 3; move++)
        {
            (move % 2 === 0 ? moved : host).append(element);
        }
        expect(seen[3]).toHaveLength(2);
        expect(seen[3]?.every((node, index) => node === held[index])).toBe(true);
        expect(element.querySelector("zl-forwarded-to section")?.textContent).toBe("12");
        expect(element.querySelector("section")?.childNodes.length).toBe(nodes);
    });

    it("keeps the view's own nodes out of children bound first in a template of their own", () =>
    {
        const open = signal(true);
        const seen: (readonly Node[])[] = [];
        define("zl-nested-first", {
            props: [],
            view: ({ children }) =>
            {
                seen.push(children.get());
                return html`<h2>Title</h2>${when(open, () => html`${children}<hr>`)}`;
            }
        });
        host = document.createElement("div");
        document.body.append(host);
        host.innerHTML = "<zl-nested-first><b>one</b><i>two</i></zl-nested-first>";
        const element = host.firstElementChild as HTMLElement;
        const held = seen[0] as readonly Node[];
        const moved = document.createElement("section");
        host.append(moved);
        moved.append(element);
        host.append(element);
        expect(seen[2]).toHaveLength(2);
        expect(seen[2]?.every((node, index) => node === held[index])).toBe(true);
        expect(element.textContent).toBe("Titleonetwo");
        expect(element.querySelectorAll("h2")).toHaveLength(1);
        expect(element.querySelectorAll("hr")).toHaveLength(1);
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
