// Executed examples for the testing guide.
import { afterEach, describe, expect, it } from "vitest";
import { html, signal } from "zerolith";
import { accessibilityIssues, cleanup, hydrationMismatches, mount, settle } from "@zerolith/test";

function Counter(): unknown
{
    const count = signal(0);
    return html`<button @click=${() => count.set(count.get() + 1)}>Clicked ${count} times</button>`;
}

afterEach(cleanup);

describe("testing guide", () =>
{
    it("mounts, interacts, and checks hydration and accessibility", async () =>
    {
        // #region mount
        const { container } = mount(Counter());
        container.querySelector("button")?.click();
        await settle();
        expect(container.textContent).toBe("Clicked 1 times");
        // #endregion mount

        // #region checks
        expect(hydrationMismatches(() => Counter())).toEqual([]);
        expect(accessibilityIssues(container)).toEqual([]);
        // #endregion checks
    });
});
