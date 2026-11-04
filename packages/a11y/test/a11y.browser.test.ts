import { afterEach, describe, expect, it, vi } from "vitest";
import { effect, html, signal } from "zerolith";
import { cleanup, mount, settle } from "@zerolith/test";
import { createAnnouncer, focusOrigin, focusTrap, focusables, inertOutside, mediaQuery, rovingTabindex, visuallyHidden } from "@zerolith/a11y";

afterEach(() =>
{
    cleanup();
    document.body.focus();
});

function press(target: Element, key: string, init: KeyboardEventInit = {}): boolean
{
    return target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
}

/** The ids of every inert element in the page, sorted. */
function inertIds(): string[]
{
    return [...document.querySelectorAll("[inert]")].map((element) => element.id).toSorted();
}

describe("focusTrap", () =>
{
    it("moves focus in, wraps Tab at both ends, pulls focus back, and restores it on removal", async () =>
    {
        const outside = mount(html`<button id="outside">outside</button>`);
        const outsideButton = outside.container.querySelector("button") as HTMLButtonElement;
        outsideButton.focus();
        expect(document.activeElement).toBe(outsideButton);

        const dialog = mount(html`<div role="dialog" ref=${focusTrap()}><button id="first">one</button><input id="middle"><button id="last">three</button></div>`);
        const element = dialog.container.firstElementChild as HTMLElement;
        const first = element.querySelector("#first") as HTMLElement;
        const last = element.querySelector("#last") as HTMLElement;
        await settle();
        expect(document.activeElement).toBe(first);
        expect(focusables(element).map((item) => item.id)).toEqual(["first", "middle", "last"]);

        last.focus();
        expect(press(last, "Tab")).toBe(false);
        expect(document.activeElement).toBe(first);
        expect(press(first, "Tab", { shiftKey: true })).toBe(false);
        expect(document.activeElement).toBe(last);
        expect(press(last, "a")).toBe(true);

        outsideButton.focus();
        expect(document.activeElement).toBe(first);

        dialog.unmount();
        expect(document.activeElement).toBe(outsideButton);
    });

    it("lets only the newest of two traps act, and hands control back when it is removed", async () =>
    {
        const first = mount(html`<div ref=${focusTrap()}><button id="first-a">A</button><button id="first-b">B</button></div>`);
        await settle();
        const inFirst = first.container.querySelector("#first-b") as HTMLElement;
        inFirst.focus();
        const second = mount(html`<div ref=${focusTrap()}><button id="second">OK</button></div>`);
        await settle();
        expect(document.activeElement?.id).toBe("second");
        (first.container.querySelector("#first-a") as HTMLElement).focus();
        expect(document.activeElement?.id).toBe("second");

        second.unmount();
        expect(document.activeElement).toBe(inFirst);
        const outside = document.createElement("button");
        document.body.append(outside);
        outside.focus();
        expect(first.container.contains(document.activeElement)).toBe(true);
        outside.remove();
    });

    it("honors the initial option and leaves focus alone when told to", async () =>
    {
        const outside = mount(html`<button>outside</button>`);
        const outsideButton = outside.container.querySelector("button") as HTMLButtonElement;
        outsideButton.focus();
        const chosen = mount(html`<div ref=${focusTrap({ initial: "#second", restore: false })}><button id="first">one</button><button id="second">two</button></div>`);
        await settle();
        expect(document.activeElement?.id).toBe("second");
        chosen.unmount();
        expect(document.activeElement).toBe(document.body);

        outsideButton.focus();
        mount(html`<div ref=${focusTrap({ initial: false })}><button>one</button></div>`);
        await settle();
        expect(document.activeElement).toBe(outsideButton);
    });

    it("acts while its element is rendered, so a closed dialog or a hidden drawer neither acts nor stands in the way of an older trap", async () =>
    {
        const older = mount(html`<div ref=${focusTrap()}><button id="older">older</button></div>`);
        await settle();
        const hidden = mount(html`<div hidden ref=${focusTrap()}><button id="hidden">hidden</button></div>`);
        await settle();
        expect(document.activeElement?.id).toBe("older");
        expect(hidden.container.firstElementChild?.hasAttribute("tabindex")).toBe(false);
        const outside = mount(html`<button id="outside">outside</button>`);
        (outside.container.querySelector("button") as HTMLButtonElement).focus();
        expect(document.activeElement?.id).toBe("older");
        hidden.unmount();
        older.unmount();
    });

    it("acts on a native dialog only while it is open", async () =>
    {
        const older = mount(html`<div ref=${focusTrap()}><button id="older">older</button></div>`);
        await settle();
        const outside = mount(html`<button id="outside">outside</button>`);
        const outsideButton = outside.container.querySelector("button") as HTMLButtonElement;
        const trapped = mount(html`<dialog ref=${focusTrap({ restore: false })}><button id="inside">inside</button></dialog>`);
        const dialog = trapped.container.firstElementChild as HTMLDialogElement;
        const inside = dialog.querySelector("button") as HTMLButtonElement;
        await settle();
        expect(document.activeElement?.id).toBe("older");

        outsideButton.focus();
        expect(document.activeElement?.id).toBe("older");
        expect(press(document.activeElement as Element, "Tab")).toBe(false);
        expect(document.activeElement?.id).toBe("older");

        dialog.show();
        inside.focus();
        expect(document.activeElement).toBe(inside);
        outsideButton.focus();
        expect(document.activeElement).toBe(inside);
        expect(press(inside, "Tab")).toBe(false);
        expect(document.activeElement).toBe(inside);

        dialog.close();
        outsideButton.focus();
        expect(document.activeElement?.id).toBe("older");
        older.unmount();
        outsideButton.focus();
        expect(document.activeElement).toBe(outsideButton);
    });
});

describe("inertOutside", () =>
{
    it("makes the siblings of the element and of its ancestors inert, leaves what was inert alone, and undoes only what it did", () =>
    {
        const page = mount(html`<main><p id="before">before</p><section><nav id="menu"><a href="/">home</a></nav><p id="aside" inert>aside</p></section><p id="after">after</p></main>`);
        const main = page.container.firstElementChild as HTMLElement;
        const menu = main.querySelector("#menu") as HTMLElement;
        const sibling = document.createElement("p");
        sibling.id = "sibling";
        document.body.append(sibling);
        expect(inertIds()).toEqual(["aside"]);

        const restore = inertOutside(menu);
        expect(inertIds()).toEqual(["after", "aside", "before", "sibling"]);
        expect(page.container.hasAttribute("inert")).toBe(false);
        expect(main.hasAttribute("inert")).toBe(false);
        expect(menu.hasAttribute("inert")).toBe(false);
        expect(menu.querySelector("a")?.hasAttribute("inert")).toBe(false);

        restore();
        expect(inertIds()).toEqual(["aside"]);
        expect(page.container.hasAttribute("inert")).toBe(false);
        sibling.remove();
    });

    it("holds an element given before it is in the page once it is, and keeps what two holds share until the last lets go", async () =>
    {
        const open = signal(true);
        const page = mount(html`<main><p id="before">before</p><nav id="menu" ref=${(nav: Element) => effect(() => (open.get() ? inertOutside(nav) : undefined))}><a href="/">home</a></nav><p id="after">after</p></main>`);
        expect(inertIds()).toEqual([]);
        await settle();
        expect(inertIds()).toEqual(["after", "before"]);

        page.container.id = "first";
        const second = mount(html`<main><p id="other">other</p><aside id="panel">panel</aside></main>`);
        const panel = second.container.querySelector("#panel") as HTMLElement;
        const release = inertOutside(panel);
        expect(inertIds()).toEqual(["after", "before", "first", "other"]);
        open.set(false);
        await settle();
        expect(inertIds()).toEqual(["first", "other"]);
        release();
        expect(inertIds()).toEqual([]);
    });

    it("reaches past a shadow tree to its host's siblings", () =>
    {
        const page = mount(html`<main><p id="before">before</p><div id="host"></div><p id="after">after</p></main>`);
        const host = page.container.querySelector("#host") as HTMLElement;
        const root = host.attachShadow({ mode: "open" });
        root.innerHTML = "<p id=\"shadow-before\">x</p><nav id=\"menu\"><a href=\"/\">home</a></nav>";
        const menu = root.querySelector("#menu") as HTMLElement;
        const release = inertOutside(menu);
        expect(inertIds()).toEqual(["after", "before"]);
        expect(root.querySelector("#shadow-before")?.hasAttribute("inert")).toBe(true);
        expect(host.hasAttribute("inert")).toBe(false);
        release();
        expect(inertIds()).toEqual([]);
        expect(root.querySelector("#shadow-before")?.hasAttribute("inert")).toBe(false);
    });
});

describe("focusables", () =>
{
    it("leaves out controls a disabled fieldset disables and elements that are invisible", () =>
    {
        const { container } = mount(html`<fieldset disabled><button>In</button></fieldset><button style="visibility: hidden">Hidden</button><button>Out</button>`);
        expect(focusables(container).map((element) => element.textContent)).toEqual(["Out"]);
    });
});

describe("rovingTabindex", () =>
{
    it("keeps one item tabbable, moves with the arrow keys, and follows selection and focus", () =>
    {
        const { container } = mount(html`
            <div role="tablist" ref=${rovingTabindex({ orientation: "horizontal" })}>
                <button role="tab" id="a">A</button>
                <button role="tab" id="b" aria-selected="true">B</button>
                <button role="tab" id="c" disabled>C</button>
                <button role="tab" id="d">D</button>
            </div>`);
        const list = container.firstElementChild as HTMLElement;
        const tab = (id: string): HTMLElement => list.querySelector(`#${id}`) as HTMLElement;
        expect([tab("a").tabIndex, tab("b").tabIndex, tab("d").tabIndex]).toEqual([-1, 0, -1]);

        tab("b").focus();
        expect(press(tab("b"), "ArrowRight")).toBe(false);
        expect(document.activeElement).toBe(tab("d"));
        expect(tab("d").tabIndex).toBe(0);
        expect(tab("b").tabIndex).toBe(-1);
        press(tab("d"), "ArrowRight");
        expect(document.activeElement).toBe(tab("a"));
        press(tab("a"), "End");
        expect(document.activeElement).toBe(tab("d"));
        press(tab("d"), "Home");
        expect(document.activeElement).toBe(tab("a"));
        expect(press(tab("a"), "ArrowDown")).toBe(true);
        expect(document.activeElement).toBe(tab("a"));

        tab("d").focus();
        expect(tab("d").tabIndex).toBe(0);
        expect(tab("a").tabIndex).toBe(-1);
    });

    it("leaves the arrow keys to a text field inside an item", () =>
    {
        const { container } = mount(html`
            <div role="listbox" ref=${rovingTabindex({ orientation: "horizontal" })}>
                <div role="option" id="one">One <input id="rename" value="One"></div>
                <div role="option" id="two">Two</div>
            </div>`);
        const field = container.querySelector("#rename") as HTMLInputElement;
        field.focus();
        expect(press(field, "ArrowRight")).toBe(true);
        expect(document.activeElement).toBe(field);
    });

    it("skips items that are hidden, such as the children of a collapsed tree item", () =>
    {
        const { container } = mount(html`
            <div role="tree" ref=${rovingTabindex({ orientation: "vertical" })}>
                <div role="treeitem" id="parent" aria-expanded="false">Parent</div>
                <div role="treeitem" id="child" hidden>Child</div>
                <div role="treeitem" id="next">Next</div>
            </div>`);
        const item = (id: string): HTMLElement => container.querySelector(`#${id}`) as HTMLElement;
        item("parent").focus();
        press(item("parent"), "ArrowDown");
        expect(document.activeElement).toBe(item("next"));
        expect(item("child").tabIndex).toBe(-1);
        expect(item("next").tabIndex).toBe(0);
    });

    it("stops at the ends without loop and picks up items added later", async () =>
    {
        const { container } = mount(html`<ul role="listbox" ref=${rovingTabindex({ loop: false, orientation: "vertical" })}><li role="option" id="x">x</li></ul>`);
        const list = container.firstElementChild as HTMLElement;
        const x = list.querySelector("#x") as HTMLElement;
        x.focus();
        press(x, "ArrowUp");
        expect(document.activeElement).toBe(x);
        const y = document.createElement("li");
        y.setAttribute("role", "option");
        y.id = "y";
        list.append(y);
        await vi.waitFor(() => expect(y.tabIndex).toBe(-1));
        press(x, "ArrowDown");
        expect(document.activeElement).toBe(y);
        press(y, "ArrowDown");
        expect(document.activeElement).toBe(y);
    });
});

describe("createAnnouncer", () =>
{
    it("writes messages into hidden live regions and repeats them", async () =>
    {
        const announcer = createAnnouncer();
        expect(document.querySelectorAll("[aria-live]")).toHaveLength(2);
        announcer.announce("Saved");
        announcer.announce("Failed", "assertive");
        await vi.waitFor(() => expect(document.querySelector("[aria-live=\"assertive\"]")?.textContent).toBe("Failed"));
        await vi.waitFor(() => expect(document.querySelector("[aria-live=\"polite\"]")?.textContent).toBe("Saved"));
        const polite = document.querySelector("[aria-live=\"polite\"]") as HTMLElement;
        expect(polite.classList.contains(visuallyHidden.scope)).toBe(true);
        expect(polite.getAttribute("role")).toBe("status");
        announcer.announce("Saved");
        expect(polite.textContent).toBe("");
        await vi.waitFor(() => expect(polite.textContent).toBe("Saved"));
        announcer.announce("Failed", "assertive");
        await vi.waitFor(() => expect(document.querySelector("[aria-live=\"assertive\"]")?.textContent).toBe("Failed"));
        announcer.dispose();
        expect(document.querySelector("[aria-live]")).toBeNull();
    });
});

describe("focusOrigin", () =>
{
    it("tells keyboard focus from pointer focus and marks the root element", () =>
    {
        const monitor = focusOrigin();
        const { container } = mount(html`<button id="one">one</button><button id="two">two</button>`);
        const one = container.querySelector("#one") as HTMLElement;
        const two = container.querySelector("#two") as HTMLElement;
        expect(monitor.origin.get()).toBeNull();

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
        one.focus();
        expect(monitor.origin.get()).toBe("keyboard");
        expect(document.documentElement.getAttribute("data-focus-origin")).toBe("keyboard");

        two.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
        two.focus();
        expect(monitor.origin.get()).toBe("pointer");

        monitor.dispose();
        expect(document.documentElement.hasAttribute("data-focus-origin")).toBe(false);
        one.focus();
        expect(monitor.origin.get()).toBe("pointer");
    });
});

describe("mediaQuery", () =>
{
    it("reflects the query and shares one signal per query", () =>
    {
        expect(mediaQuery("(min-width: 1px)").get()).toBe(true);
        expect(mediaQuery("(min-width: 100000px)").get()).toBe(false);
        expect(mediaQuery("(min-width: 1px)")).toBe(mediaQuery("(min-width: 1px)"));
    });
});
