import { afterEach, describe, expect, it, vi } from "vitest";
import { type Diagnostic, type ReadableSignal, type Renderable, type Root, type View, ZerolithError, boundary, computed, context, each, effect, html, onDiagnostic, onDispose, render, signal, unsafeHtml, when } from "zerolith";
import { type DevtoolsHook, devtoolsInternal, prepared, scan } from "zerolith/internal";

let root: Root | undefined;
let host: HTMLElement | undefined;

function notRenderable(): unknown
{
    return undefined;
}

/** A component that takes props, for the check that one passed uncalled is refused. */
function Greeting({ name }: { name: string }): View
{
    return html`<p>Hello, ${name}</p>`;
}

function mount(view: Renderable | (() => Renderable)): HTMLElement
{
    host = document.createElement("div");
    document.body.append(host);
    root = render(view, host);
    return host;
}

/** A row function whose computed value carries `name`, to find it among the development tools' nodes. */
function namedRow(name: string): (item: { get(): { id: number } }) => Renderable
{
    return (item) => html`<li>${computed(() => item.get().id, { name })}</li>`;
}

/** A paragraph whose ref is the value given, the same strings on every call. */
function referenced(ref: unknown): View
{
    return html`<p ref=${ref}></p>`;
}

/** A template of one bold element, the same strings on every call. */
function card(text: string): unknown
{
    return html`<b>${text}</b>`;
}

/** The comments inside `node`, which only part markers put there. */
function comments(node: Node): Comment[]
{
    const found: Comment[] = [];
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_COMMENT);
    while (walk.nextNode() !== null)
    {
        found.push(walk.currentNode as Comment);
    }
    return found;
}

afterEach(() =>
{
    root?.dispose();
    root = undefined;
    host?.remove();
    host = undefined;
});

describe("html and render", () =>
{
    it("takes a selector for the container and reports one that matches nothing", () =>
    {
        host = document.createElement("div");
        host.id = "selector-host";
        document.body.append(host);
        root = render(html`<p>by selector</p>`, "#selector-host");
        expect(root.container).toBe(host);
        expect(host.textContent).toBe("by selector");
        expect(() => render(html`<p></p>`, "#nowhere")).toThrow(/mount_target_missing/);
    });

    it("renders one view object in several places at once, as hoisted static views are", () =>
    {
        const icon = html`<b>static</b>`;
        const el = mount(html`<p>${icon}${icon}</p>${[icon, icon]}`);
        expect(el.querySelectorAll("b")).toHaveLength(4);
        expect(el.querySelector("p")?.textContent).toBe("staticstatic");
    });

    it("renders a template prepared ahead of time as it renders a scanned one", () =>
    {
        const strings = ["<p class=\"", "\">", "</p>"];
        const { markup, parts } = scan(strings);
        const tag = prepared(strings, markup, parts.map((part) => [part.kind, part.name, part.strings]));
        const scannedHost = document.createElement("div");
        const scannedRoot = render(html`<p class="${"note"}">${"prepared"}</p>`, scannedHost);
        const el = mount(html(tag, "note", "prepared"));
        expect(el.innerHTML).toBe(scannedHost.innerHTML);
        expect(el.querySelector("p")?.className).toBe("note");
        scannedRoot.dispose();
    });

    it("renders text, numbers, nested templates, nodes, and iterables", () =>
    {
        const strong = document.createElement("strong");
        strong.textContent = "node";
        const el = mount(html`<p>${"text"} ${1} ${html`<em>nested</em>`} ${strong} ${[html`<i>a</i>`, "b"]}</p>`);
        expect(el.querySelector("p")?.textContent).toBe("text 1 nested node ab");
        expect(el.querySelector("em")?.textContent).toBe("nested");
        expect(el.querySelector("strong")).toBe(strong);
    });

    it("renders nothing for booleans, null, and undefined", () =>
    {
        const el = mount(html`<p>${true}${false}${null}${undefined}</p>`);
        expect(el.querySelector("p")?.textContent).toBe("");
    });

    it("escapes markup in values", () =>
    {
        const el = mount(html`<p>${"<b>not bold</b>"}</p>`);
        expect(el.querySelector("p")?.textContent).toBe("<b>not bold</b>");
        expect(el.querySelector("b")).toBeNull();
    });

    it("binds each part on its own node, past siblings, deeper elements, and back up, in one root and in several", () =>
    {
        const el = mount(html`<section data-a=${"a"}><div><p title=${"p"} lang=${"en"}>${"one"}<b>${"two"}</b></p><i data-i=${"i"}></i></div><span>${"three"} tail</span><em data-e=${"e"}>${"four"}</em></section>`);
        expect(el.querySelector("section")?.dataset["a"]).toBe("a");
        expect([el.querySelector("p")?.title, el.querySelector("p")?.lang]).toEqual(["p", "en"]);
        expect(el.querySelector("p")?.firstChild?.textContent).toBe("one");
        expect(el.querySelector("b")?.textContent).toBe("two");
        expect(el.querySelector("i")?.dataset["i"]).toBe("i");
        expect(el.querySelector("span")?.textContent).toBe("three tail");
        expect([el.querySelector("em")?.dataset["e"], el.querySelector("em")?.textContent]).toEqual(["e", "four"]);
        const lists = mount(html`<ul><li data-x=${"x"}>${"first"}</li><li><span data-y=${"y"}></span></li><li></li><li data-z=${"z"}></li></ul><ol><li>${"second"}</li></ol>`);
        expect(lists.querySelector("[data-x]")?.textContent).toBe("first");
        expect(lists.querySelector("span")?.dataset["y"]).toBe("y");
        expect(lists.querySelector("ul")?.lastElementChild?.getAttribute("data-z")).toBe("z");
        expect(lists.querySelector("ol li")?.textContent).toBe("second");
    });

    it("updates a signal binding in place without re-running the template", () =>
    {
        const count = signal(1);
        const factory = vi.fn(() => html`<p>Count: ${count}</p>`);
        const el = mount(factory());
        const text = el.querySelector("p")?.firstChild?.nextSibling;
        expect(el.querySelector("p")?.textContent).toBe("Count: 1");
        count.set(2);
        expect(el.querySelector("p")?.textContent).toBe("Count: 2");
        expect(el.querySelector("p")?.firstChild?.nextSibling).toBe(text);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it("switches between value kinds in one position", () =>
    {
        const value = signal<unknown>("text");
        const el = mount(html`<div>${value}</div>`);
        const div = el.querySelector("div") as HTMLDivElement;
        expect(div.textContent).toBe("text");
        value.set(html`<span>el</span>`);
        expect(div.querySelector("span")?.textContent).toBe("el");
        value.set(null);
        expect(div.textContent).toBe("");
        value.set(3);
        expect(div.textContent).toBe("3");
    });

    it("shows a template again after showing nothing, though its strings are the ones it showed before", () =>
    {
        const value = signal<unknown>(card("first"));
        const el = mount(html`<div>${value}</div>`);
        const div = el.querySelector("div") as HTMLDivElement;
        value.set(null);
        expect(div.querySelector("b")).toBeNull();
        value.set(card("second"));
        expect(div.querySelector("b")?.textContent).toBe("second");
    });

    it("removes a list's rows and stops updating them once the position shows something else", () =>
    {
        const items = signal([{ id: 1 }, { id: 2 }]);
        const value = signal<unknown>(each(items, (item) => item.id, (item) => html`<i>${item.get().id}</i>`));
        const el = mount(html`<div>${value}</div>`);
        const div = el.querySelector("div") as HTMLDivElement;
        expect(div.querySelectorAll("i").length).toBe(2);
        value.set("text");
        expect(div.querySelectorAll("i").length).toBe(0);
        items.set([{ id: 1 }, { id: 2 }, { id: 3 }]);
        expect(div.querySelectorAll("i").length).toBe(0);
        expect(div.textContent).toBe("text");
    });

    it("keeps the DOM when a signal yields a template with the same strings", () =>
    {
        const name = signal("a");
        const view = computed(() => html`<p class="row">${name.get()}</p>`);
        const el = mount(html`<div>${view}</div>`);
        const p = el.querySelector("p");
        name.set("b");
        expect(el.querySelector("p")).toBe(p);
        expect(p?.textContent).toBe("b");
    });

    it("rejects functions and plain objects as content with a coded error", () =>
    {
        expect(() => mount(html`<p>${notRenderable}</p>`)).toThrow(ZerolithError);
        try
        {
            mount(html`<p>${{ a: 1 }}</p>`);
        }
        catch (error)
        {
            expect((error as ZerolithError).diagnostic.code).toBe("unrenderable_value");
        }
    });

    it("disposes effects and removes nodes on dispose", () =>
    {
        const count = signal(0);
        const runs = vi.fn(() =>
        {
            count.get();
        });
        const el = mount(html`<p>${computed(() =>
        {
            effect(runs);
            return count.get();
        })}</p>`);
        expect(el.querySelector("p")).not.toBeNull();
        root?.dispose();
        root = undefined;
        expect(el.querySelector("p")).toBeNull();
        const calls = runs.mock.calls.length;
        count.set(1);
        expect(runs).toHaveBeenCalledTimes(calls);
    });
});

describe("render with a function", () =>
{
    it("calls the function inside the root's owner, so its cleanups end with the root", () =>
    {
        let cleaned = 0;
        function Panel(): View
        {
            onDispose(() =>
            {
                cleaned += 1;
            });
            return html`<p>panel</p>`;
        }
        const el = mount(() => Panel());
        expect(el.textContent).toBe("panel");
        expect(cleaned).toBe(0);
        root?.dispose();
        root = undefined;
        expect(cleaned).toBe(1);
        expect(el.textContent).toBe("");
    });

    it("calls a function that returns such a function, as a build tool's wrapper does", () =>
    {
        const el = mount((() => () => html`<p>wrapped</p>`) as unknown as Renderable);
        expect(el.textContent).toBe("wrapped");
    });

    it("refuses a component passed instead of called, naming it", () =>
    {
        expect(() => mount(Greeting as unknown as Renderable)).toThrow(/mount_component_uncalled.*name=Greeting/);
        expect(() => mount((() => Greeting) as unknown as Renderable)).toThrow(/mount_component_uncalled/);
    });
});

describe("attribute bindings", () =>
{
    it("sets static and live attributes and removes them for null", () =>
    {
        const title = signal<string | null>("one");
        const el = mount(html`<p title=${title} data-x="static ${"v"}"></p>`);
        const p = el.querySelector("p") as HTMLParagraphElement;
        expect(p.getAttribute("title")).toBe("one");
        expect(p.getAttribute("data-x")).toBe("static v");
        title.set("two");
        expect(p.getAttribute("title")).toBe("two");
        title.set(null);
        expect(p.hasAttribute("title")).toBe(false);
    });

    it("toggles boolean attributes", () =>
    {
        const disabled = signal(false);
        const el = mount(html`<button ?disabled=${disabled}>x</button>`);
        const button = el.querySelector("button") as HTMLButtonElement;
        expect(button.disabled).toBe(false);
        disabled.set(true);
        expect(button.hasAttribute("disabled")).toBe(true);
    });

    it("sets properties with the source case", () =>
    {
        const value = signal("hello");
        const el = mount(html`<input .value=${value} .tabIndex=${3}>`);
        const input = el.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("hello");
        expect(input.tabIndex).toBe(3);
        value.set("world");
        expect(input.value).toBe("world");
    });

    it("attaches event listeners and swaps them when the template updates", () =>
    {
        const first = vi.fn();
        const second = vi.fn();
        const handler = signal<() => void>(first);
        const view = computed(() => html`<button @click=${handler.get()}>x</button>`);
        const el = mount(html`<div>${view}</div>`);
        const button = el.querySelector("button") as HTMLButtonElement;
        button.click();
        expect(first).toHaveBeenCalledTimes(1);
        handler.set(second);
        expect(el.querySelector("button")).toBe(button);
        button.click();
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("rejects a signal as an event handler with a coded error", () =>
    {
        const handler = signal(() => undefined);
        expect(() => mount(html`<button @click=${handler}>x</button>`)).toThrow(/event_handler_not_function/);
    });

    it("hands the element to a ref signal and resets it on removal, or calls a ref function once", () =>
    {
        const input = signal<HTMLInputElement | undefined>(undefined);
        const seen: Element[] = [];
        const el = mount(html`<input ref=${input}><p ref=${(element: Element) => seen.push(element)}></p>`);
        expect(input.get()).toBe(el.querySelector("input"));
        expect(seen).toEqual([el.querySelector("p")]);
        root?.dispose();
        root = undefined;
        expect(input.get()).toBeUndefined();
        expect(seen).toHaveLength(1);
    });

    it("rejects a ref target that is neither a signal nor a function", () =>
    {
        expect(() => mount(html`<p ref=${"x"}></p>`)).toThrow(/ref_not_assignable/);
    });

    it("hands the element to nothing for a null or undefined ref, and releases a ref a signal replaces", () =>
    {
        const target = signal<Element | null | undefined>(undefined);
        const holder = signal<Element | undefined>(undefined);
        const el = mount(html`<p ref=${target}></p><i ref=${null}></i><b ref=${undefined}></b>`);
        expect(target.get()).toBe(el.querySelector("p"));
        expect(el.querySelectorAll("i, b")).toHaveLength(2);
        const current = signal<unknown>(holder);
        const second = mount(html`${computed(() => referenced(current.get()))}`);
        expect(holder.get()).toBe(second.querySelector("p"));
        current.set(null);
        expect(holder.get()).toBeUndefined();
        current.set(undefined);
        current.set(holder);
        expect(holder.get()).toBe(second.querySelector("p"));
    });

    it("shows a fragment's nodes as content and replaces them with the next value", () =>
    {
        const content = signal<unknown>(undefined);
        const fragment = document.createDocumentFragment();
        fragment.append(document.createElement("b"), document.createTextNode("two"));
        const el = mount(html`<p>${content}</p>`);
        content.set(fragment);
        expect(el.querySelector("p")?.innerHTML).toContain("<b></b>two");
        content.set("plain");
        expect(el.querySelector("p")?.textContent).toBe("plain");
        expect(el.querySelector("b")).toBeNull();
        content.set(fragment);
        expect(el.querySelector("p")?.textContent).toBe("");
    });

    it("adds a handler object with its options and swaps it for a function", () =>
    {
        const calls: string[] = [];
        const object = {
            handleEvent(event: Event): void
            {
                calls.push(`object:${event.type}`);
            },
            once: true
        };
        const handler = signal<unknown>(object);
        const el = mount(html`${computed(() => html`<button @click=${handler.get()}>go</button>`)}`);
        const button = el.querySelector("button") as HTMLButtonElement;
        button.click();
        button.click();
        expect(calls).toEqual(["object:click"]);
        handler.set(() => calls.push("function"));
        button.click();
        expect(calls).toEqual(["object:click", "function"]);
    });

    it("renders into a fragment and keeps it live, and renders raw markup as it is", () =>
    {
        const fragment = document.createDocumentFragment();
        const count = signal(1);
        const into = render(html`<p>${count}</p>${unsafeHtml("<i>raw &amp; <b>bold</b></i>")}`, fragment);
        expect(into.container).toBe(fragment);
        host = document.createElement("div");
        document.body.append(host);
        host.append(fragment);
        expect(host.querySelector("p")?.textContent).toBe("1");
        count.set(2);
        expect(host.querySelector("p")?.textContent).toBe("2");
        expect(host.querySelector("i")?.innerHTML).toBe("raw &amp; <b>bold</b>");
        into.dispose();
        expect(host.querySelector("p")).toBeNull();
        expect(host.querySelector("i")).toBeNull();
    });

    it("takes plain values for when and each, read once", () =>
    {
        const el = mount(html`<p>${when(true, () => "yes", () => "no")}${when(0, () => "yes", () => "no")}</p><ul>${each([{ id: 1 }, { id: 2 }], (item) => item.id, (item) => html`<li>${computed(() => item.get().id)}</li>`)}</ul>`);
        expect(el.querySelector("p")?.textContent).toBe("yesno");
        expect(Array.from(el.querySelectorAll("li"), (li) => li.textContent)).toEqual(["1", "2"]);
    });

    it("blocks scriptable URLs and reports a warning", () =>
    {
        const seen: Diagnostic[] = [];
        const off = onDiagnostic((d) => seen.push(d));
        const el = mount(html`<a href=${"javascript:alert(1)"}>x</a><img src=${"data:image/png;base64,AA=="}>`);
        off();
        expect(el.querySelector("a")?.hasAttribute("href")).toBe(false);
        expect(el.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AA==");
        expect(seen.map((d) => d.code)).toEqual(["unsafe_url_blocked"]);
    });

    it("disposes what a failed render started and leaves the container as it was", () =>
    {
        const container = document.createElement("div");
        host = container;
        container.innerHTML = "<p>kept</p>";
        document.body.append(container);
        const count = signal(0);
        let runs = 0;
        expect(() => render(() =>
        {
            effect(() =>
            {
                count.get();
                runs++;
            });
            throw new Error("view failed");
        }, container)).toThrow("view failed");
        count.set(1);
        expect(runs).toBe(1);
        expect(container.innerHTML).toBe("<p>kept</p>");
    });

    it("refuses a function as the items of each", () =>
    {
        expect(() => each((() => []) as never, (item: number) => item, () => html`<li></li>`)).toThrow(/each_items_function/);
    });

    it("leaves no development timing in the page's performance buffer", () =>
    {
        mount(html`<p>${computed(() => "timed")}</p>`);
        expect(performance.getEntriesByType("measure").filter((entry) => /^(zerolith:)?(render|hydrate|effect)$/.test(entry.name))).toEqual([]);
    });

    it("blocks scriptable URLs bound as properties", () =>
    {
        const seen: Diagnostic[] = [];
        const off = onDiagnostic((d) => seen.push(d));
        const url = signal("https://example.com/");
        const el = mount(html`<a .href=${url}>x</a><iframe .src=${"java\tscript:alert(1)"}></iframe>`);
        const link = el.querySelector("a") as HTMLAnchorElement;
        expect(link.href).toBe("https://example.com/");
        url.set(" JAVASCRIPT:alert(1)");
        off();
        expect(link.hasAttribute("href")).toBe(false);
        expect(el.querySelector("iframe")?.hasAttribute("src")).toBe(false);
        expect(seen.map((d) => d.code)).toEqual(["unsafe_url_blocked", "unsafe_url_blocked"]);
    });

    it("keeps a ref and a ref callback's setup when a signal applies the same template again", () =>
    {
        const n = signal(0);
        const input = signal<Element | undefined>(undefined);
        const log: string[] = [];
        const tooltip = (element: Element): void =>
        {
            log.push(`setup ${element.tagName}`);
            onDispose(() => log.push("cleanup"));
        };
        const el = mount(html`<div>${computed(() => html`<input ref=${input} value=${n.get()}><p ref=${tooltip}></p>`)}</div>`);
        const mounted = el.querySelector("input");
        n.set(1);
        expect(el.querySelector("input")).toBe(mounted);
        expect(input.get()).toBe(mounted);
        expect(log).toEqual(["setup P", "cleanup", "setup P"]);
    });
});

describe("a binding that is its element's only child", () =>
{
    it("shows text and nothing in the one text node it starts with, with no marker", () =>
    {
        const value = signal<string | null>("first");
        const el = mount(html`<p>${value}</p>`);
        const p = el.querySelector("p") as HTMLParagraphElement;
        const text = p.firstChild;
        expect(text?.nodeType).toBe(Node.TEXT_NODE);
        expect(p.childNodes.length).toBe(1);
        expect(p.textContent).toBe("first");
        value.set(null);
        expect(p.childNodes.length).toBe(1);
        expect(p.matches(":empty")).toBe(true);
        value.set("again");
        expect(p.firstChild).toBe(text);
        expect(p.textContent).toBe("again");
        expect(comments(p)).toEqual([]);
    });

    it("adds its marker when it first shows a template, a list, or a node, and keeps every later value before it", () =>
    {
        const value = signal<unknown>("text");
        const el = mount(html`<div>${value}</div>`);
        const div = el.querySelector("div") as HTMLDivElement;
        expect(comments(div)).toEqual([]);
        value.set(html`<b>bold</b>`);
        const marker = div.lastChild;
        expect(marker?.nodeType).toBe(Node.COMMENT_NODE);
        expect(div.querySelector("b")?.textContent).toBe("bold");
        value.set(["a", "b"]);
        expect(div.textContent).toBe("ab");
        const node = document.createElement("i");
        value.set(node);
        expect(node.nextSibling).toBe(marker);
        value.set("back");
        expect(div.textContent).toBe("back");
        expect(div.lastChild).toBe(marker);
        value.set(null);
        expect(Array.from(div.childNodes)).toEqual([marker]);
        value.set(html`<b>again</b>`);
        expect(div.querySelector("b")?.nextSibling).toBe(marker);
        expect(comments(div)).toEqual([marker]);
    });

    it("keeps the marker of a binding beside other nodes", () =>
    {
        const value = signal("b");
        const el = mount(html`<p>a ${value}</p>`);
        const p = el.querySelector("p") as HTMLParagraphElement;
        expect(comments(p).length).toBe(1);
        value.set("c");
        expect(p.textContent).toBe("a c");
    });

    it("has no marker in a template imported for each use, as one with a form control is", () =>
    {
        const value = signal("first");
        const el = mount(html`<div><span>${value}</span><input></div>`);
        const span = el.querySelector("span") as HTMLSpanElement;
        expect(span.childNodes.length).toBe(1);
        value.set("second");
        expect(span.textContent).toBe("second");
        expect(comments(span)).toEqual([]);
    });

    it("leaves no marker in keyed rows whose bindings are their elements' only children", () =>
    {
        const items = signal([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
        const el = mount(html`<table><tbody>${each(items, (item) => item.id, (item) => html`<tr><td>${item.get().id}</td><td>${computed(() => item.get().name)}</td></tr>`)}</tbody></table>`);
        const body = el.querySelector("tbody") as HTMLTableSectionElement;
        expect(comments(body).length).toBe(1);
        items.set([{ id: 2, name: "B" }, { id: 1, name: "a" }, { id: 3, name: "c" }]);
        expect(Array.from(body.querySelectorAll("tr")).map((row) => row.textContent)).toEqual(["2B", "1a", "3c"]);
        expect(comments(body).length).toBe(1);
        items.set([]);
        expect(body.childNodes.length).toBe(1);
    });
});

/** A value read through a computed value that throws once `count` passes `limit`. */
function failingAbove(count: ReadableSignal<number>, limit: number, message: string): ReadableSignal<number>
{
    return computed(() =>
    {
        if (count.get() > limit)
        {
            throw new Error(message);
        }
        return count.get();
    });
}

/** A branch that throws as it is created. */
function badBranch(): View
{
    throw new Error("bad branch");
}

/** A fallback that shows the error's message in a paragraph. */
function showMessage(error: unknown): View
{
    return html`<p>${(error as Error).message}</p>`;
}

describe("boundary", () =>
{
    it("shows the fallback when the content throws as it renders, and the content again on retry", () =>
    {
        let broken = true;
        let again: (() => void) | undefined;
        const Chart = (): View =>
        {
            if (broken)
            {
                throw new Error("no data");
            }
            return html`<b>chart</b>`;
        };
        const el = mount(html`<section>${boundary(() => Chart(), (error, retry) =>
        {
            again = retry;
            return showMessage(error);
        })}</section>`);
        expect(el.querySelector("p")?.textContent).toBe("no data");
        broken = false;
        again?.();
        expect(el.querySelector("b")?.textContent).toBe("chart");
        expect(el.querySelector("p")).toBeNull();
    });

    it("takes what a binding inside throws on an update in place of the code that changed the signal, and reports it", () =>
    {
        const count = signal(1);
        const shown = failingAbove(count, 1, "too many");
        const codes: string[] = [];
        const stop = onDiagnostic((found) => codes.push(found.code));
        const el = mount(html`<div>${boundary(() => html`<i>${shown}</i>`, showMessage)}</div><span>${count}</span>`);
        expect(el.querySelector("i")?.textContent).toBe("1");
        expect(() => count.set(2)).not.toThrow();
        expect(el.querySelector("p")?.textContent).toBe("too many");
        expect(el.querySelector("i")).toBeNull();
        expect(el.querySelector("span")?.textContent).toBe("2");
        expect(codes).toContain("boundary_caught");
        stop();
    });

    it("catches a binding that throws as the content first renders, and renders the fallback once", () =>
    {
        const shown = failingAbove(signal(2), 1, "at once");
        let fallbacks = 0;
        const el = mount(html`<div>${boundary(() => html`<i>${shown}</i>`, (error) =>
        {
            fallbacks++;
            return showMessage(error);
        })}</div>`);
        expect(el.querySelector("div")?.textContent).toBe("at once");
        expect(el.querySelector("i")).toBeNull();
        expect(fallbacks).toBe(1);
    });

    it("catches what throws inside a context provided within it", () =>
    {
        const theme = context("light");
        const count = signal(1);
        const shown = failingAbove(count, 1, "inside provide");
        const el = mount(html`<div>${boundary(() => theme.provide("dark", () => html`${when(true, () => html`<i>${shown}</i>`)}`), showMessage)}</div>`);
        expect(() => count.set(2)).not.toThrow();
        expect(el.querySelector("p")?.textContent).toBe("inside provide");
    });

    it("catches a branch or a row the content creates later, and an effect that throws as it runs again", () =>
    {
        const open = signal(false);
        const rows = signal([1]);
        const runs = signal(0);
        const el = mount(html`<div>${boundary(() => html`${when(open, () => badBranch())}`, showMessage)}</div>`);
        open.set(true);
        expect(el.querySelector("p")?.textContent).toBe("bad branch");
        const list = mount(html`<ul>${boundary(() => html`${each(rows, (row) => row, (row) =>
        {
            if (row.get() > 1)
            {
                throw new Error("bad row");
            }
            return html`<li>${row}</li>`;
        })}`, showMessage)}</ul>`);
        rows.set([1, 2]);
        expect(list.querySelector("p")?.textContent).toBe("bad row");
        const watched = mount(html`<div>${boundary(() =>
        {
            effect(() =>
            {
                if (runs.get() > 0)
                {
                    throw new Error("bad effect");
                }
            });
            return html`<b>fine</b>`;
        }, showMessage)}</div>`);
        expect(() => runs.set(1)).not.toThrow();
        expect(watched.querySelector("p")?.textContent).toBe("bad effect");
    });

    it("lets an error outside every boundary reach the code that caused the run", () =>
    {
        const count = signal(1);
        const shown = failingAbove(count, 1, "uncaught");
        mount(html`<i>${shown}</i>`);
        expect(() => count.set(2)).toThrow("uncaught");
    });

    it("hands a fallback that throws to the boundary around it", () =>
    {
        const el = mount(html`<div>${boundary(() => boundary(() =>
        {
            throw new Error("inner");
        }, () =>
        {
            throw new Error("fallback");
        }), showMessage)}</div>`);
        expect(el.querySelector("p")?.textContent).toBe("fallback");
    });
});

describe("context", () =>
{
    it("reaches components that each and when create after provide returns, as rows are added and branches open", () =>
    {
        const theme = context("light");
        const rows = signal([1]);
        const open = signal(false);
        const Label = (): View => html`<i>${theme.read()}</i>`;
        const el = mount(theme.provide("dark", () => html`
            <ul>${each(rows, (row) => row, () => html`<li>${Label()}</li>`)}</ul>
            <p>${when(open, () => Label(), () => html`<b>closed</b>`)}</p>`));
        expect(el.querySelector("li")?.textContent).toBe("dark");
        rows.set([1, 2]);
        open.set(true);
        expect([...el.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["dark", "dark"]);
        expect(el.querySelector("p")?.textContent).toBe("dark");
    });

    it("gives the initial value to a list made outside every provide, though it is shown inside one", () =>
    {
        const theme = context("light");
        const outside = each([1], (row) => row, () => html`<li>${theme.read()}</li>`);
        const el = mount(theme.provide("dark", () => html`<ul>${outside}</ul>`));
        expect(el.querySelector("li")?.textContent).toBe("light");
    });
});

describe("each", () =>
{
    interface Item
    {
        id: number;
        name: string;
    }

    it("renders keyed rows, updates them in place, and moves nodes instead of recreating them", () =>
    {
        const items = signal<Item[]>([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }]);
        const el = mount(html`<ul>${each(items, (item) => item.id, (item) => html`<li>${computed(() => item.get().name)}</li>`)}</ul>`);
        const [a, b, c] = Array.from(el.querySelectorAll("li"));
        expect(Array.from(el.querySelectorAll("li")).map((li) => li.textContent)).toEqual(["a", "b", "c"]);

        items.set([{ id: 3, name: "c" }, { id: 1, name: "A" }, { id: 4, name: "d" }]);
        const after = Array.from(el.querySelectorAll("li"));
        expect(after.map((li) => li.textContent)).toEqual(["c", "A", "d"]);
        expect(after[0]).toBe(c);
        expect(after[1]).toBe(a);
        expect(b?.isConnected).toBe(false);
    });

    it("disposes a removed row's effects", () =>
    {
        const items = signal<Item[]>([{ id: 1, name: "a" }]);
        const tick = signal(0);
        const runs = vi.fn(() =>
        {
            tick.get();
        });
        mount(html`${each(items, (item) => item.id, () =>
        {
            effect(runs);
            return html`<i></i>`;
        })}`);
        expect(runs).toHaveBeenCalledTimes(1);
        items.set([]);
        tick.set(1);
        expect(runs).toHaveBeenCalledTimes(1);
    });

    it("moves and removes rows whose template starts or ends with a binding", () =>
    {
        const items = signal<Item[]>([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }]);
        const el = mount(html`<div>${each(items, (item) => item.id, (item) => html`${computed(() => item.get().name)}<hr>${item.get().id}`)}</div>`);
        expect(el.textContent).toBe("a1b2c3");
        items.set([{ id: 3, name: "c" }, { id: 1, name: "A" }]);
        expect(el.textContent).toBe("c3A1");
        expect(el.querySelectorAll("hr")).toHaveLength(2);
        items.set([]);
        expect(el.textContent).toBe("");
        expect(el.querySelectorAll("hr")).toHaveLength(0);
    });

    for (const alone of [true, false])
    {
        it(`follows any sequence of changes ${alone ? "as the only content of its parent" : "between other nodes"}`, () =>
        {
            let seed = 7;
            const random = (limit: number): number =>
            {
                seed = (seed * 16807) % 2147483647;
                return seed % limit;
            };
            let next = 1;
            const fresh = (count: number): Item[] => Array.from({ length: count }, () => ({ id: next, name: `n${next++}` }));
            const items = signal<Item[]>([]);
            const rows = each(items, (item) => item.id, (item, index) => html`<li data-index=${index}>${computed(() => item.get().name)}</li>`);
            const el = mount(alone ? html`<ul>${rows}</ul>` : html`<ul><li>first</li>${rows}<li>last</li></ul>`);
            for (let step = 0; step < 300; step++)
            {
                const list = items.get().slice();
                const operation = random(7);
                if (operation === 0)
                {
                    list.length = 0;
                }
                else if (operation === 1)
                {
                    list.push(...fresh(random(4) + 1));
                }
                else if (operation === 2)
                {
                    list.unshift(...fresh(random(4) + 1));
                }
                else if (operation === 3)
                {
                    list.splice(random(list.length + 1), 0, ...fresh(random(3) + 1));
                }
                else if (operation === 4 && list.length > 0)
                {
                    list.splice(random(list.length), random(3) + 1);
                }
                else if (operation === 5)
                {
                    list.splice(0, list.length, ...fresh(random(6)));
                }
                else
                {
                    for (let i = list.length - 1; i > 0; i--)
                    {
                        const j = random(i + 1);
                        [list[i], list[j]] = [list[j] as Item, list[i] as Item];
                    }
                }
                items.set(list);
                const shown = Array.from(el.querySelectorAll("li")).map((li) => li.textContent);
                expect(shown).toEqual([...(alone ? [] : ["first"]), ...list.map((item) => item.name), ...(alone ? [] : ["last"])]);
                expect(Array.from(el.querySelectorAll("li[data-index]")).map((li) => li.getAttribute("data-index"))).toEqual(list.map((_, i) => String(i)));
            }
        });
    }

    it("swaps two rows by moving only those two", () =>
    {
        const items = signal<Item[]>(Array.from({ length: 6 }, (_, i) => ({ id: i, name: `r${i}` })));
        const el = mount(html`<ul>${each(items, (item) => item.id, (item, index) => html`<li data-index=${index}>${computed(() => item.get().name)}</li>`)}</ul>`);
        const before = Array.from(el.querySelectorAll("li"));
        const moved: Node[] = [];
        const observer = new MutationObserver((records) =>
        {
            for (const record of records)
            {
                moved.push(...record.addedNodes);
            }
        });
        observer.observe(el.querySelector("ul") as Node, { childList: true });
        const list = items.get().slice();
        [list[1], list[4]] = [list[4] as Item, list[1] as Item];
        list[2] = { id: 2, name: "two" };
        items.set(list);
        observer.takeRecords().forEach((record) => moved.push(...record.addedNodes));
        observer.disconnect();
        const after = Array.from(el.querySelectorAll("li"));
        expect(after.map((li) => li.textContent)).toEqual(["r0", "r4", "two", "r3", "r1", "r5"]);
        expect(after.map((li) => li.getAttribute("data-index"))).toEqual(["0", "1", "2", "3", "4", "5"]);
        expect(after[1]).toBe(before[4]);
        expect(after[4]).toBe(before[1]);
        expect(new Set(moved)).toEqual(new Set([before[1], before[4]]));
    });

    it("moves, swaps, and removes rows of several top-level nodes, taking all of each row's nodes", () =>
    {
        const items = signal<Item[]>([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }]);
        const el = mount(html`<dl>${each(items, (item) => item.id, (item) => html`<dt>${item.get().id}</dt><dd>${computed(() => item.get().name)}</dd>`)}</dl>`);
        const list = el.querySelector("dl") as HTMLDListElement;
        const read = (): string[] => Array.from(list.children, (node) => node.textContent ?? "");
        expect(read()).toEqual(["1", "a", "2", "b", "3", "c"]);
        items.set([{ id: 3, name: "c" }, { id: 2, name: "B" }, { id: 1, name: "a" }]);
        expect(read()).toEqual(["3", "c", "2", "B", "1", "a"]);
        items.set([{ id: 2, name: "B" }, { id: 4, name: "d" }, { id: 3, name: "c" }]);
        expect(read()).toEqual(["2", "B", "4", "d", "3", "c"]);
        items.set([{ id: 3, name: "c" }]);
        expect(read()).toEqual(["3", "c"]);
    });

    it("counts what a row's view creates as the application's in the development tools, and as the inspector's in rows the inspector renders", () =>
    {
        const tools = (globalThis as { __ZEROLITH_DEVTOOLS__?: DevtoolsHook }).__ZEROLITH_DEVTOOLS__ as DevtoolsHook;
        const items = signal([{ id: 1 }]);
        mount(html`<ul>${each(items, (item) => item.id, namedRow("application row"))}</ul>`);
        const inspector = document.createElement("div");
        document.body.append(inspector);
        const inspectorRoot = devtoolsInternal(() => render(html`<ul>${each(items, (item) => item.id, namedRow("inspector row"))}</ul>`, inspector));
        const nodes = tools.nodes();
        expect(nodes.find((node) => node.name === "application row")?.internal).toBe(false);
        expect(nodes.find((node) => node.name === "inspector row")?.internal).toBe(true);
        inspectorRoot.dispose();
        inspector.remove();
    });

    it("creates the index signal only for a row function that takes it", () =>
    {
        const indexes: unknown[] = [];
        const list = [{ id: 1, name: "a" }];
        const without = each(list, (item) => item.id, (...args: unknown[]) =>
        {
            indexes.push(args[1]);
            return html`<li></li>`;
        });
        const taking = each(list, (item) => item.id, (item, index) =>
        {
            indexes.push(index.get());
            return html`<li>${item.get().name}</li>`;
        });
        mount(html`<ul>${without}</ul><ul>${taking}</ul>`);
        expect(indexes).toEqual([undefined, 0]);
    });

    it("rejects a key an update repeats from a row it keeps in place", () =>
    {
        const items = signal<Item[]>([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }]);
        mount(html`<ul>${each(items, (item) => item.id, (item) => html`<li>${computed(() => item.get().name)}</li>`)}</ul>`);
        expect(() => items.set([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 1, name: "again" }])).toThrow(/each_key_duplicate/);
        expect(() => items.set([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }, { id: 2, name: "again" }])).toThrow(/each_key_duplicate/);
    });

    it("leaves every row as it was when an update repeats or leaves out a key, and takes the next update whole", () =>
    {
        const items = signal<Item[]>([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
        const list = mount(html`<ul>${each(items, (item) => item.id, (item) => html`<li>${computed(() => item.get().name)}</li>`)}</ul>`);
        const shown = (): string[] => [...list.querySelectorAll("li")].map((row) => row.textContent ?? "");
        const [first, second] = list.querySelectorAll("li");
        expect(() => items.set([{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 3, name: "c" }, { id: 3, name: "d" }])).toThrow(/each_key_duplicate/);
        expect(shown()).toEqual(["a", "b"]);
        expect(() => items.set([{ id: 1, name: "A" }, { id: 4, name: "x" }, { id: 4, name: "y" }, { id: 2, name: "B" }])).toThrow(/each_key_duplicate/);
        expect(shown()).toEqual(["a", "b"]);
        expect(() => items.set([{ id: 3, name: "c" }, { id: 1, name: "A" }, { id: 3, name: "d" }])).toThrow(/each_key_duplicate/);
        expect(shown()).toEqual(["a", "b"]);
        expect(() => items.set([{ id: 1, name: "A" }, { id: undefined as unknown as number, name: "x" }, { id: 2, name: "B" }])).toThrow(/each_key_undefined/);
        expect(shown()).toEqual(["a", "b"]);
        items.set([{ id: 2, name: "B" }, { id: 3, name: "c" }, { id: 1, name: "A" }]);
        expect(shown()).toEqual(["B", "c", "A"]);
        const rows = list.querySelectorAll("li");
        expect(rows[0]).toBe(second);
        expect(rows[2]).toBe(first);
        items.set([{ id: 3, name: "C" }]);
        expect(shown()).toEqual(["C"]);
    });

    it("updates the rows kept at either end of an update that swaps two rows", () =>
    {
        const items = signal<Item[]>([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }, { id: 4, name: "d" }]);
        const list = mount(html`<ul>${each(items, (item) => item.id, (item) => html`<li>${computed(() => item.get().name)}</li>`)}</ul>`);
        items.set([{ id: 1, name: "A" }, { id: 3, name: "c" }, { id: 2, name: "b" }, { id: 4, name: "D" }]);
        expect([...list.querySelectorAll("li")].map((row) => row.textContent)).toEqual(["A", "c", "b", "D"]);
    });

    it("rejects duplicate and undefined keys", () =>
    {
        const dupes = [{ id: 1, name: "a" }, { id: 1, name: "b" }];
        expect(() => mount(html`${each(dupes, (item) => item.id, () => html`<i></i>`)}`)).toThrow(/each_key_duplicate/);
        expect(() => mount(html`${each(dupes, () => undefined as unknown as number, () => html`<i></i>`)}`)).toThrow(/each_key_undefined/);
    });
});

describe("when", () =>
{
    it("refuses a function as its condition with a coded error, for code the types do not check", () =>
    {
        // @ts-expect-error a function is not a condition
        expect(() => when(() => true, () => html`<p>x</p>`)).toThrow(/when_condition_function/);
    });

    it("shows a branch, disposes it when hidden, and ignores changes that keep the same truthiness", () =>
    {
        const user = signal<string | null>(null);
        const thenFactory = vi.fn(() => html`<p>hi ${user}</p>`);
        const el = mount(html`<div>${when(user, thenFactory, () => html`<p>sign in</p>`)}</div>`);
        expect(el.textContent).toBe("sign in");
        user.set("ann");
        expect(el.textContent).toBe("hi ann");
        user.set("bob");
        expect(el.textContent).toBe("hi bob");
        expect(thenFactory).toHaveBeenCalledTimes(1);
        user.set(null);
        expect(el.textContent).toBe("sign in");
    });

    it("removes the content of bindings at a branch's edges when the branch changes", () =>
    {
        const user = signal<string | null>("ann");
        const greeting = signal("hi");
        const el = mount(html`<div>${when(user, () => html`${greeting} <b>${user}</b> ${greeting}`, () => html`${"sign"} in`)}</div>`);
        expect(el.textContent).toBe("hi ann hi");
        user.set(null);
        expect(el.textContent).toBe("sign in");
        greeting.set("hello");
        expect(el.textContent).toBe("sign in");
        user.set("bob");
        expect(el.textContent).toBe("hello bob hello");
    });

    it("removes a template's leading binding content when the view changes", () =>
    {
        const view = signal<unknown>(html`${"first"}<i>one</i>`);
        const el = mount(html`<div>${view}</div>`);
        expect(el.textContent).toBe("firstone");
        view.set(html`<i>two</i>`);
        expect(el.textContent).toBe("two");
    });
});
