import { afterEach, beforeEach, expect, it } from "vitest";
import { accessibilityIssues, cleanup, mount } from "@zerolith/test";
import { Packing } from "../src/components/packing.ts";
import { items } from "../src/store.ts";

beforeEach(() =>
{
    items.set([
        { id: 1, name: "Passport", packed: true },
        { id: 2, name: "Phone charger", packed: false },
        { id: 3, name: "Rain jacket", packed: false }
    ]);
});
afterEach(cleanup);

it("checks an item off and counts it as packed", () =>
{
    const { container } = mount(Packing());
    expect(container.querySelector("p")?.textContent).toBe("1 of 3 packed");
    container.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1]?.click();
    expect(container.querySelector("p")?.textContent).toBe("2 of 3 packed");
});

it("adds an item from the form", () =>
{
    const { container } = mount(Packing());
    const form = container.querySelector("form");
    const field = container.querySelector<HTMLInputElement>("input[name=name]");
    if (form === null || field === null)
    {
        throw new Error("the page has no form");
    }
    field.value = "Sunscreen";
    form.requestSubmit();
    expect(container.querySelectorAll("li")).toHaveLength(4);
    expect(field.value).toBe("");
});

it("names every control", () =>
{
    const { container } = mount(Packing());
    expect(accessibilityIssues(container)).toEqual([]);
});
