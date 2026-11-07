// The release notes pages in a browser, with a stand-in for fetch.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { accessibilityIssues, cleanup, mount } from "@zerolith/test";
import { Releases } from "../src/components/releases.ts";
import { router } from "../src/router.ts";
import { type Release, releases } from "../src/store.ts";

const sample: Release[] = [
    {
        version: "1.1.0",
        date: "2026-02-16",
        summary: "Tags",
        notes: ["Tag an entry with any word."]
    },
    {
        version: "1.0.0",
        date: "2026-01-12",
        summary: "The first release",
        notes: ["Write an entry for each day."]
    }
];
const start = location.href;

beforeEach(() =>
{
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(sample)));
    releases.reload();
});
afterEach(async () =>
{
    cleanup();
    vi.unstubAllGlobals();
    await router.navigate(start, { replace: true });
});

function rowCount(container: HTMLElement): number
{
    return container.querySelectorAll("li").length;
}

it("lists the releases once they load", async () =>
{
    const { container } = mount(() => Releases());
    await vi.waitFor(() => expect(rowCount(container)).toBe(2));
    const link = container.querySelector("li a");
    expect(link?.getAttribute("href")).toBe("/releases/1.1.0");
});

it("searches once you pause typing, and puts the search in the address",
    async () =>
    {
        const { container } = mount(() => Releases());
        await vi.waitFor(() => expect(rowCount(container)).toBe(2));
        const field = container.querySelector("input");
        if (field === null)
        {
            throw new Error("the page has no search field");
        }
        field.value = "tag";
        field.dispatchEvent(new Event("input"));
        expect(rowCount(container)).toBe(2);
        await vi.waitFor(() => expect(rowCount(container)).toBe(1));
        expect(router.url.get().searchParams.get("q")).toBe("tag");
    });

it("opens on the search in the address", async () =>
{
    await router.navigate("?q=tag", { replace: true });
    const { container } = mount(() => Releases());
    await vi.waitFor(() => expect(rowCount(container)).toBe(1));
    expect(container.querySelector("input")?.value).toBe("tag");
});

it("offers to try again when the releases do not load", async () =>
{
    const missing = new Response(null, { status: 404 });
    vi.stubGlobal("fetch", () => Promise.resolve(missing));
    releases.reload();
    const { container } = mount(() => Releases());
    const retry = (): HTMLButtonElement | null =>
        container.querySelector("button");
    await vi.waitFor(() => expect(retry()?.textContent).toBe("Try again"));
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json(sample)));
    retry()?.click();
    await vi.waitFor(() => expect(rowCount(container)).toBe(2));
});

it("shows a release's notes at its address, with its title", async () =>
{
    const { container } = mount(router.outlet());
    await router.navigate("/releases/1.1.0");
    const note = (): string | null | undefined =>
        container.querySelector("li")?.textContent;
    await vi.waitFor(() => expect(note()).toBe("Tag an entry with any word."));
    expect(document.title).toBe("1.1.0 release notes");
    expect(document.activeElement).toBe(container.querySelector("h1"));
});

it("names every control", async () =>
{
    const { container } = mount(() => Releases());
    await vi.waitFor(() => expect(rowCount(container)).toBe(2));
    expect(accessibilityIssues(container)).toEqual([]);
});
