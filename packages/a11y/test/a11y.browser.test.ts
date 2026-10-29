import { afterEach, describe, expect, it, vi } from "vitest";
import { html } from "zerolith";
import { cleanup, mount, settle } from "@zerolith/test";
import { createAnnouncer, focusOrigin, focusTrap, focusables, mediaQuery, rovingTabindex, visuallyHidden } from "@zerolith/a11y";

afterEach(() =>
{
    cleanup();
    document.body.focus();
});

function press(target: Element, key: string, init: KeyboardEventInit = {}): boolean
{
    return target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
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
        announcer.announce("Saved");
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
