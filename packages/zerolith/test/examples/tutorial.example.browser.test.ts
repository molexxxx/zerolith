// Executed checks for the tutorial. Every file a step shows is a fixture
// under fixtures/tutorial, laid out as the reader's project is, and each
// step's page runs here the way it runs in the reader's browser. The
// finished app's own test file runs here too, in order with the storage
// check, since both use the same storage key.
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createRouter } from "@zerolith/router";
import { cleanup, mount } from "@zerolith/test";
import { routes } from "../fixtures/tutorial/page/src/routes.ts";
import { Packing as StatePage } from "../fixtures/tutorial/state/src/components/packing.ts";
import { items as stateItems } from "../fixtures/tutorial/state/src/store.ts";
import { Packing as EventsPage } from "../fixtures/tutorial/events/src/components/packing.ts";
import { items as eventsItems } from "../fixtures/tutorial/events/src/store.ts";
import { Packing as ComponentsPage } from "../fixtures/tutorial/components/src/components/packing.ts";
import { Packing as DerivedPage } from "../fixtures/tutorial/derived/src/components/packing.ts";
import { filter as derivedFilter, items as derivedItems } from "../fixtures/tutorial/derived/src/store.ts";

afterEach(cleanup);

afterAll(() =>
{
    localStorage.removeItem("packing-list");
});

await import("../fixtures/tutorial/app/test/packing.browser.test.ts");

/** The visible text of every row, with the whitespace the template keeps collapsed. */
function rows(container: HTMLElement): string[]
{
    return [...container.querySelectorAll("li")].map((row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "");
}

function submit(container: HTMLElement, name: string): void
{
    const form = container.querySelector("form");
    const field = container.querySelector<HTMLInputElement>("input[name=name]");
    if (form === null || field === null)
    {
        throw new Error("the page has no form");
    }
    field.value = name;
    form.requestSubmit();
}

describe("tutorial", () =>
{
    it("adds a page to the route table", async () =>
    {
        const router = createRouter(routes, { window: null });
        await router.navigate("/packing");
        const { container } = mount(router.outlet());
        expect(container.querySelector("h1")?.textContent).toBe("Packing list");
        expect(router.head.get().title).toBe("Packing list");
        router.dispose();
    });

    it("renders the list from a signal and keeps each row by its key", () =>
    {
        const { container } = mount(StatePage());
        const first = container.querySelector("li");
        expect(rows(container)).toEqual(["Passport", "Phone charger", "Rain jacket"]);
        stateItems.set([...stateItems.get(), { id: 4, name: "Sunscreen", packed: false }]);
        expect(rows(container)).toHaveLength(4);
        expect(container.querySelector("li")).toBe(first);
        expect(container.querySelector("p")?.textContent).toBe("4 items");
    });

    it("checks items off and adds new ones", () =>
    {
        const { container } = mount(EventsPage());
        container.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1]?.click();
        expect(eventsItems.get()[1]?.packed).toBe(true);
        submit(container, "Sunscreen");
        expect(rows(container).at(-1)).toBe("Sunscreen");
        expect(container.querySelector<HTMLInputElement>("input[name=name]")?.value).toBe("");
    });

    it("splits the page into components that each run once", () =>
    {
        const { container } = mount(ComponentsPage());
        const remove = container.querySelector<HTMLButtonElement>("button[aria-label=\"Remove Passport\"]");
        remove?.click();
        expect(rows(container)).toEqual(["Phone charger Remove", "Rain jacket Remove"]);
    });

    it("derives the progress and the filtered rows", () =>
    {
        const { container } = mount(DerivedPage());
        expect(container.querySelector("p")?.textContent).toBe("1 of 3 packed");
        const choose = (label: string): void => [...container.querySelectorAll("button")].find((button) => button.textContent === label)?.click();
        choose("Packed");
        expect(rows(container)).toEqual(["Passport Remove"]);
        choose("Left to pack");
        derivedItems.set(derivedItems.get().map((item) => ({ ...item, packed: true })));
        expect(rows(container)).toEqual([]);
        expect(container.textContent).toContain("Nothing to show here.");
        expect(derivedFilter.get()).toBe("left");
    });

    it("loads the list from storage and saves every change", async () =>
    {
        localStorage.setItem("packing-list", JSON.stringify([{ id: 7, name: "Map", packed: false }]));
        const { items, toggle } = await import("../fixtures/tutorial/effects/src/store.ts");
        expect(items.get()).toEqual([{ id: 7, name: "Map", packed: false }]);
        toggle(7);
        expect(JSON.parse(localStorage.getItem("packing-list") ?? "[]")).toEqual([{ id: 7, name: "Map", packed: true }]);
    });
});
