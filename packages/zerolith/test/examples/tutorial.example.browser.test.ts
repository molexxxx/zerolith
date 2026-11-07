// Executed checks for the tutorial. Every file a step shows is a fixture
// under fixtures/tutorial, laid out as the reader's project is, and each
// step's page runs here the way it runs in the reader's browser. The
// finished app's own test file runs here too, in order with the storage
// checks, since they all use the same storage key. The finished app keeps
// its list in a stored signal for that key, as the undo step does, so the
// undo step's store is the second for the key in this page and reports it.
// The finished app's tests neither undo nor go offline, so the undo
// step's checks run on its page too, once its history forgets the
// checkpoints those tests saved.
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { onDiagnostic } from "zerolith";
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
import { Packing as AppPage } from "../fixtures/tutorial/app/src/components/packing.ts";
import { changes as appChanges, items as appItems } from "../fixtures/tutorial/app/src/store.ts";
import type * as EffectsStore from "../fixtures/tutorial/effects/src/store.ts";
import type * as UndoStore from "../fixtures/tutorial/undo/src/store.ts";

afterEach(() =>
{
    cleanup();
    connect(true);
});

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

/** Makes the browser report the connection `online` says, with the event it fires when the connection changes. */
function connect(online: boolean): void
{
    if (online)
    {
        Reflect.deleteProperty(navigator, "onLine");
    }
    else
    {
        Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    }
    dispatchEvent(new Event(online ? "online" : "offline"));
}

/** Checks the packing page from the undo step on, given a list of Map alone and nothing to undo: Undo takes back checking Map off, adding Tent, and removing Map, in the rows and in storage; Redo brings the removal back; and the status line notes when the browser is offline. */
function undoesAndNotesOffline(container: HTMLElement): void
{
    const button = (label: string): HTMLButtonElement | undefined => [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
    const disabled = (): Array<boolean | undefined> => [button("Undo")?.disabled, button("Redo")?.disabled];
    const box = (): HTMLInputElement | null => container.querySelector<HTMLInputElement>("input[type=checkbox]");
    const saved = (): unknown => JSON.parse(localStorage.getItem("packing-list") ?? "null");
    const item = { id: 7, name: "Map", packed: false };
    expect(rows(container)).toEqual(["Map Remove"]);
    expect(disabled()).toEqual([true, true]);
    box()?.click();
    expect(saved()).toEqual([{ ...item, packed: true }]);
    button("Undo")?.click();
    expect(box()?.checked).toBe(false);
    expect(saved()).toEqual([item]);
    expect(disabled()).toEqual([true, false]);
    submit(container, "Tent");
    expect(rows(container)).toEqual(["Map Remove", "Tent Remove"]);
    expect(saved()).toEqual([item, { id: 8, name: "Tent", packed: false }]);
    button("Undo")?.click();
    expect(rows(container)).toEqual(["Map Remove"]);
    expect(saved()).toEqual([item]);
    button("Remove")?.click();
    expect(rows(container)).toEqual([]);
    expect(saved()).toEqual([]);
    expect(disabled()).toEqual([false, true]);
    button("Undo")?.click();
    expect(rows(container)).toEqual(["Map Remove"]);
    expect(saved()).toEqual([item]);
    expect(disabled()).toEqual([true, false]);
    button("Redo")?.click();
    expect(rows(container)).toEqual([]);
    expect(saved()).toEqual([]);
    const status = container.querySelector("[role=status]");
    expect(status?.textContent).toBe("");
    connect(false);
    expect(status?.textContent).toBe("Offline: changes are saved on this device.");
    connect(true);
    expect(status?.textContent).toBe("");
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
        expect(container.querySelector("p")?.textContent).toBe("Items: 4");
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
        const remove = (name: string): void => container.querySelector<HTMLButtonElement>(`button[aria-label="Remove ${name}"]`)?.click();
        const focused = (): string => (document.activeElement?.closest("li") ?? document.activeElement)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        remove("Phone charger");
        expect(rows(container)).toEqual(["Passport Remove", "Rain jacket Remove"]);
        expect(focused()).toBe("Rain jacket Remove");
        remove("Rain jacket");
        expect(focused()).toBe("Passport Remove");
        remove("Passport");
        expect(document.activeElement).toBe(container.querySelector("input[name=name]"));
    });

    it("derives the progress and the filtered rows", () =>
    {
        const { container } = mount(DerivedPage());
        expect(container.querySelector("p")?.textContent).toBe("1 of 3 packed");
        const choose = (label: string): void => [...container.querySelectorAll("button")].find((button) => button.textContent === label)?.click();
        choose("Packed");
        expect(rows(container)).toEqual(["Passport Remove"]);
        choose("Left to pack");
        container.querySelector<HTMLInputElement>("li input")?.click();
        expect(rows(container)).toEqual(["Rain jacket Remove"]);
        expect(document.activeElement).toBe(container.querySelector("li input"));
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
        for (const [index, saved] of ["{not json", "null", "{}", "42", "[1,2,3]", "[{\"id\":1,\"packed\":false}]", "[{\"id\":1,\"name\":\"Map\"}]", "[{\"id\":\"1\",\"name\":\"Map\",\"packed\":false}]"].entries())
        {
            localStorage.setItem("packing-list", saved);
            const fresh = `../fixtures/tutorial/effects/src/store.ts?saved=${index}`;
            const store = await import(/* @vite-ignore */ fresh) as typeof EffectsStore;
            expect(store.items.get().map((item) => item.name)).toEqual(["Passport", "Phone charger", "Rain jacket"]);
        }
    });

    it("keeps the list in storage, undoes and redoes its changes, and notes when it is offline", async () =>
    {
        localStorage.setItem("packing-list", JSON.stringify([{ id: 7, name: "Map", packed: false }]));
        const reported: string[] = [];
        const stop = onDiagnostic((record) => reported.push(`${record.code} ${String(record.args?.["key"])}`));
        const { Packing } = await import("../fixtures/tutorial/undo/src/components/packing.ts");
        stop();
        expect(reported).toEqual(["state_key_duplicate packing-list"]);
        undoesAndNotesOffline(mount(Packing()).container);
        for (const [index, saved] of ["{}", "[1,2,3]", "[{\"id\":1,\"name\":\"Map\"}]"].entries())
        {
            localStorage.setItem("packing-list", saved);
            const heard: string[] = [];
            const quiet = onDiagnostic((record) => heard.push(record.code));
            const fresh = `../fixtures/tutorial/undo/src/store.ts?saved=${index}`;
            const store = await import(/* @vite-ignore */ fresh) as typeof UndoStore;
            quiet();
            expect(store.items.get().map((item) => item.name)).toEqual(["Passport", "Phone charger", "Rain jacket"]);
            expect(heard).toContain("state_storage_unreadable");
        }
    });

    it("keeps undo, redo, and the offline note on the finished page", () =>
    {
        appItems.set([{ id: 7, name: "Map", packed: false }]);
        appChanges.dispose();
        undoesAndNotesOffline(mount(AppPage()).container);
    });

    it("hands focus to the other button when undo or redo turns its own button off", () =>
    {
        appItems.set([{ id: 7, name: "Map", packed: false }]);
        appChanges.dispose();
        const { container } = mount(AppPage());
        const button = (label: string): HTMLButtonElement | undefined => [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
        container.querySelector<HTMLInputElement>("li input")?.click();
        button("Undo")?.focus();
        button("Undo")?.click();
        expect(document.activeElement).toBe(button("Redo"));
        button("Redo")?.click();
        expect(document.activeElement).toBe(button("Undo"));
    });

    it("wraps a long name inside its row on a narrow screen", () =>
    {
        appItems.set([{ id: 7, name: "x".repeat(120), packed: false }]);
        const { container } = mount(AppPage());
        container.style.width = "20rem";
        expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
    });
});
