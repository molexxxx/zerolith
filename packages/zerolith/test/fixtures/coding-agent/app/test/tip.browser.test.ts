import { afterEach, expect, it } from "vitest";
import { accessibilityIssues, cleanup, mount, settle } from "@zerolith/test";
import { Tip } from "../src/components/tip.ts";

afterEach(cleanup);

it("shows the tip and the total as the bill is typed", async () =>
{
    const { container } = mount(Tip());
    const bill = container.querySelector<HTMLInputElement>("input[inputmode]");
    if (bill === null)
    {
        throw new Error("the page has no bill field");
    }
    bill.value = "50";
    bill.dispatchEvent(new Event("input"));
    await settle();
    const [tip, total] = container.querySelectorAll("p");
    expect(tip?.textContent).toBe("Tip: 9.00");
    expect(total?.textContent).toBe("Total: 59.00");
    container.querySelectorAll<HTMLInputElement>("[type=radio]")[2]?.click();
    await settle();
    expect(tip?.textContent).toBe("Tip: 10.00");
    expect(total?.textContent).toBe("Total: 60.00");
    expect(accessibilityIssues(container)).toEqual([]);
});
