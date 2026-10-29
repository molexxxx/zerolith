// Executed examples for the accessibility guide.
import { afterEach, describe, expect, it, vi } from "vitest";
import { html, signal, when } from "zerolith";
import { cleanup, mount, settle } from "@zerolith/test";
import { createAnnouncer, focusTrap, reducedMotion, rovingTabindex, visuallyHidden } from "@zerolith/a11y";

afterEach(cleanup);

describe("accessibility guide", () =>
{
    it("dialog", async () =>
    {
        const open = signal(false);
        const { container } = mount(html`
            <button @click=${() => open.set(true)}>Open</button>
            ${when(open, () => html`
                <div role="dialog" aria-modal="true" aria-labelledby="title" ref=${focusTrap()}>
                    <h2 id="title">Delete the note?</h2>
                    <button @click=${() => open.set(false)}>Cancel</button>
                    <button>Delete</button>
                </div>`)}`);
        const trigger = container.querySelector("button") as HTMLButtonElement;
        trigger.focus();
        // #region dialog
        trigger.click();
        await settle();                                             // the dialog opens and its first button has focus
        expect(document.activeElement?.textContent).toBe("Cancel");
        (document.activeElement as HTMLButtonElement).click();      // closing it returns focus to the trigger
        expect(document.activeElement).toBe(trigger);
        // #endregion dialog
    });

    it("tabs", () =>
    {
        // #region tabs
        const { container } = mount(html`
            <div role="tablist" ref=${rovingTabindex({ orientation: "horizontal" })}>
                <button role="tab" aria-selected="true">Signals</button>
                <button role="tab">Templates</button>
                <button role="tab">Routing</button>
            </div>`);
        const tabs = container.querySelectorAll<HTMLButtonElement>("[role=tab]");
        expect([...tabs].map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
        tabs[0]?.focus();
        tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement).toBe(tabs[1]);
        // #endregion tabs
    });

    it("announce and hide", async () =>
    {
        // #region announce
        const announcer = createAnnouncer();
        mount(html`<a href="/report" target="_blank">Report <span class=${visuallyHidden}>(opens in a new window)</span></a>`);
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
