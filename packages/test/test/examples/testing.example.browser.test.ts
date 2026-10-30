// Executed examples for the testing guide, shown as the tests they are.
import { afterEach, expect, it } from "vitest";
import { accessibilityIssues, cleanup, hydrationMismatches, mount, settle } from "@zerolith/test";
import { Counter } from "./counter.ts";

// #region mount
afterEach(cleanup);

it("counts clicks", async () =>
{
    const { container } = mount(Counter());
    container.querySelector("button")?.click();
    await settle();
    expect(container.textContent).toBe("Clicked 1 times");
});
// #endregion mount

// #region checks
it("hydrates in place and has no accessibility defects", () =>
{
    const { container } = mount(Counter());
    expect(hydrationMismatches(() => Counter())).toEqual([]);
    expect(accessibilityIssues(container)).toEqual([]);
});
// #endregion checks
