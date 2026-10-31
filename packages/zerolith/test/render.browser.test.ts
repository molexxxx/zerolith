import { afterEach, describe, expect, it, vi } from "vitest";
import { type Diagnostic, type Root, ZerolithError, computed, each, effect, html, onDiagnostic, render, signal, when } from "zerolith";
import { prepared, scan } from "zerolith/internal";

let root: Root | undefined;
let host: HTMLElement | undefined;

function notRenderable(): unknown
{
    return undefined;
}

function mount(view: unknown): HTMLElement
{
    host = document.createElement("div");
    document.body.append(host);
    root = render(view, host);
    return host;
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

    it("rejects duplicate and undefined keys", () =>
    {
        const dupes = [{ id: 1, name: "a" }, { id: 1, name: "b" }];
        expect(() => mount(html`${each(dupes, (item) => item.id, () => html`<i></i>`)}`)).toThrow(/each_key_duplicate/);
        expect(() => mount(html`${each(dupes, () => undefined as unknown as number, () => html`<i></i>`)}`)).toThrow(/each_key_undefined/);
    });
});

describe("when", () =>
{
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
