// Executed examples for the accessibility guide.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effect, html, render, signal, when } from "zerolith";
import { settle } from "@zerolith/test";
import { createAnnouncer, focusTrap, inertOutside, reducedMotion, rovingTabindex, visuallyHidden } from "@zerolith/a11y";

let host: HTMLElement;

beforeEach(() =>
{
    host = document.createElement("main");
    host.id = "app";
    document.body.append(host);
});

afterEach(() =>
{
    host.remove();
});

describe("accessibility guide", () =>
{
    it("dialog", async () =>
    {
        // #region dialog
        const open = signal(false);

        render(html`
            <button @click=${() => open.set(true)}>Delete note</button>
            ${when(open, () => html`
                <div role="dialog" aria-modal="true" aria-labelledby="confirm-title"
                    ref=${focusTrap()}>
                    <h2 id="confirm-title">Delete the note?</h2>
                    <button @click=${() => open.set(false)}>Cancel</button>
                    <button>Delete</button>
                </div>`)}`, "#app");
        // #endregion dialog
        const trigger = host.querySelector("button") as HTMLButtonElement;
        trigger.focus();
        trigger.click();
        await settle();
        expect(document.activeElement?.textContent).toBe("Cancel");
        (document.activeElement as HTMLButtonElement).click();
        expect(document.activeElement).toBe(trigger);
    });

    it("drawer", async () =>
    {
        // #region drawer
        const open = signal(false);

        /** Holds the page behind the menu inert while the menu is open. */
        function holdPage(nav: Element): void
        {
            effect(() => (open.get() ? inertOutside(nav) : undefined));
        }

        render(html`
            <button @click=${() => open.set(!open.get())}>Menu</button>
            <nav ?hidden=${computed(() => !open.get())} ref=${holdPage}>
                <a href="/docs">Docs</a>
            </nav>
            <main><a href="/">Home</a></main>`, "#app");
        // #endregion drawer
        const button = host.querySelector("button") as HTMLButtonElement;
        const main = host.querySelector("main") as HTMLElement;
        expect(main.hasAttribute("inert")).toBe(false);
        button.click();
        await settle();
        expect(main.hasAttribute("inert")).toBe(true);
        expect(button.hasAttribute("inert")).toBe(true);
        expect(host.querySelector("nav")?.hasAttribute("inert")).toBe(false);
        button.click();
        await settle();
        expect(main.hasAttribute("inert")).toBe(false);
        expect(button.hasAttribute("inert")).toBe(false);
    });

    it("tabs", () =>
    {
        // #region tabs
        render(html`
            <div role="tablist" aria-label="Guides"
                ref=${rovingTabindex({ orientation: "horizontal" })}>
                <button role="tab" aria-selected="true">Signals</button>
                <button role="tab" aria-selected="false">Templates</button>
                <button role="tab" aria-selected="false">Routing</button>
            </div>`, "#app");
        // #endregion tabs
        const tabs = host.querySelectorAll<HTMLButtonElement>("[role=tab]");
        expect([...tabs].map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
        tabs[0]?.focus();
        tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement).toBe(tabs[1]);
    });

    it("announce and hide", async () =>
    {
        // #region announce
        const announcer = createAnnouncer();

        render(html`
            <a href="/report" target="_blank">
                Report <span class=${visuallyHidden}>(opens in a new window)</span>
            </a>`, "#app");
        announcer.announce("Report saved");
        // #endregion announce
        await vi.waitFor(() => expect(document.querySelector("[aria-live=\"polite\"]")?.textContent).toBe("Report saved"));
        announcer.dispose();
        // #region motion
        const calm = reducedMotion();
        const duration = () => (calm.get() ? 0 : 200);
        // #endregion motion
        expect(typeof duration()).toBe("number");
    });
});
