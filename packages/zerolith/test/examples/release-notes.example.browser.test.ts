// Executed checks for the release notes tutorial. Every file a step shows is
// a fixture under fixtures/release-notes, laid out as the reader's project
// is, and each step's pages run here as they run in the reader's browser,
// with a stand-in for fetch that serves the JSON file the first step gives
// the reader. Each step's store starts loading when its module is first
// imported, so a step is imported only once the stand-in it needs is in
// place, and a check that needs a store's first load imports that step
// first. From the release step on, a step's components import its router,
// which attaches to this window and would answer link clicks, so a step's
// router is disposed as soon as it is imported; only the finished app's
// router stays, and the checks that click through pages use it. The finished
// app's own test file runs first; its hooks run around every check here as
// well, and each check sets up the stand-in it needs after them. The check
// that leaves a page without an owner comes last, since that page's effects
// keep writing to the address.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResourceStatus, ZerolithError } from "zerolith";
import { createRouter, route } from "@zerolith/router";
import { accessibilityIssues, cleanup, mount, settle } from "@zerolith/test";
import published from "../fixtures/release-notes/app/public/data/releases.json?raw";
import type { Releases as AppReleases } from "../fixtures/release-notes/app/src/components/releases.ts";
import type * as DatesModule from "../fixtures/release-notes/app/src/dates.ts";
import type { router as appRouter } from "../fixtures/release-notes/app/src/router.ts";
import type { Release } from "../fixtures/release-notes/app/src/store.ts";

await import("../fixtures/release-notes/app/test/releases.browser.test.ts");

const file = JSON.parse(published) as Release[];

type Answer = (signal: AbortSignal | undefined) => Promise<Response>;

/** A request the stand-in received: its address and its abort signal. */
interface Sent
{
    url: string;
    signal: AbortSignal | undefined;
}

const sent: Sent[] = [];

/** Answers with the file the tutorial gives the reader. */
const ok: Answer = () => Promise.resolve(new Response(published, { headers: { "content-type": "application/json" } }));
/** Never answers, and fails the request once its signal aborts, as fetch does. */
const hanging: Answer = (signal) => new Promise((_resolve, reject) =>
{
    signal?.addEventListener("abort", () => reject(signal.reason as Error));
});
/** Fails as fetch does when the connection drops. */
const dropped: Answer = () => Promise.reject(new TypeError("Failed to fetch"));

/** Answers with an empty response of the given status. */
function failing(status: number): Answer
{
    return () => Promise.resolve(new Response(null, { status }));
}

/** Puts a stand-in for fetch in place that gives each request the next answer, and every request after the last answer that one. */
function serve(...answers: Answer[]): void
{
    sent.length = 0;
    const queue = [...answers];
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    {
        const signal = init?.signal ?? undefined;
        sent.push({ url, signal });
        const answer = (queue.length > 1 ? queue.shift() : queue[0]) ?? ok;
        return answer(signal);
    });
}

/** The versions the list shows, in order. */
function versions(container: HTMLElement): string[]
{
    return [...container.querySelectorAll("li > a")].map((link) => link.textContent?.replace("Version ", "") ?? "");
}

/** The visible text of every row, with the whitespace the template keeps collapsed. */
function rows(container: HTMLElement): string[]
{
    return [...container.querySelectorAll("li")].map((row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "");
}

/** The text of each status region, in order. */
function statuses(container: HTMLElement): string[]
{
    return [...container.querySelectorAll("[role=status]")].map((region) => region.textContent ?? "");
}

function heading(container: HTMLElement): string | null | undefined
{
    return container.querySelector("h1")?.textContent;
}

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined
{
    return [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
}

/** The search field, found by its label as a reader finds it. */
function searchField(container: HTMLElement): HTMLInputElement
{
    const label = [...container.querySelectorAll("search label")].find((candidate) => candidate.textContent?.trim() === "Search the notes");
    const field = label?.querySelector("input");
    if (field === null || field === undefined)
    {
        throw new Error("the page has no search field labeled Search the notes");
    }
    return field;
}

/** Types into a field as a reader does, with the input event the field fires. */
function typeInto(field: HTMLInputElement, text: string): void
{
    field.value = text;
    field.dispatchEvent(new Event("input"));
}

/** The finished app's router and list page, with the file the tutorial gives the reader loaded. */
async function finished(): Promise<{ router: typeof appRouter; Releases: typeof AppReleases }>
{
    serve(ok);
    const { router } = await import("../fixtures/release-notes/app/src/router.ts");
    const { Releases } = await import("../fixtures/release-notes/app/src/components/releases.ts");
    const { releases } = await import("../fixtures/release-notes/app/src/store.ts");
    releases.reload();
    await vi.waitFor(() => expect(releases.status.get()).toBe("resolved"));
    return { router, Releases };
}

/** Disposes the router a step's components import, so that it answers no clicks. */
async function quiet(load: () => Promise<{ router: { dispose(): void } }>): Promise<void>
{
    (await load()).router.dispose();
}

afterEach(() =>
{
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("release notes tutorial", () =>
{
    it("loads public/data/releases.json once, when the app starts, and lists it on a page of its own", async () =>
    {
        serve(hanging);
        const { routes } = await import("../fixtures/release-notes/list/src/routes.ts");
        const { Releases } = await import("../fixtures/release-notes/list/src/components/releases.ts");
        const { releases } = await import("../fixtures/release-notes/list/src/store.ts");
        expect(sent.map((request) => request.url)).toEqual(["/data/releases.json"]);
        expect(releases.get()).toBeUndefined();
        const router = createRouter(routes, { window: null });
        await router.navigate("/releases");
        const { container } = mount(router.outlet());
        expect(heading(container)).toBe("Release notes");
        expect(router.head.get().title).toBe("Release notes");
        expect(rows(container)).toEqual([]);
        const first = sent[0];
        serve(ok);
        releases.reload();
        expect(first?.signal?.aborted).toBe(true);
        await vi.waitFor(() => expect(rows(container)).toHaveLength(7));
        expect(rows(container)).toEqual(file.map((release) => `Version ${release.version} ${release.summary}`));
        mount(Releases());
        expect(sent).toHaveLength(1);
        router.dispose();
    });

    it("fails the first step's load for an answer outside 2xx", async () =>
    {
        const { releases } = await import("../fixtures/release-notes/list/src/store.ts");
        serve(failing(404));
        releases.reload();
        await vi.waitFor(() => expect(releases.status.get()).toBe("error"));
        expect((releases.error.get() as Error).message).toBe("/data/releases.json answered 404");
        expect(sent).toHaveLength(1);
    });

    it("says it is loading, and tries a server error and a dropped connection again 250 and then 500 milliseconds later", async () =>
    {
        serve(hanging);
        const { Releases } = await import("../fixtures/release-notes/loading/src/components/releases.ts");
        const { releases } = await import("../fixtures/release-notes/loading/src/store.ts");
        const { container } = mount(Releases());
        const status = container.querySelector("[role=status]");
        expect(status?.textContent).toBe("Loading the releases");
        vi.useFakeTimers();
        serve(failing(503), dropped, ok);
        releases.reload();
        await vi.advanceTimersByTimeAsync(249);
        expect(sent).toHaveLength(1);
        expect(status?.textContent).toBe("Loading the releases");
        await vi.advanceTimersByTimeAsync(1);
        expect(sent).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(499);
        expect(sent).toHaveLength(2);
        expect(status?.textContent).toBe("Loading the releases");
        expect(button(container, "Try again")).toBeUndefined();
        await vi.advanceTimersByTimeAsync(1);
        expect(sent).toHaveLength(3);
        vi.useRealTimers();
        await vi.waitFor(() => expect(rows(container)).toHaveLength(7));
        expect(status?.textContent).toBe("");
        expect(container.querySelector("[role=status]")).toBe(status);
    });

    it("stops a request after ten seconds, tries it again, and says the releases did not load once the last try fails", async () =>
    {
        const { Releases } = await import("../fixtures/release-notes/loading/src/components/releases.ts");
        const { releases } = await import("../fixtures/release-notes/loading/src/store.ts");
        const { container } = mount(Releases());
        const status = container.querySelector("[role=status]");
        vi.useFakeTimers();
        serve(hanging, hanging, failing(503));
        releases.reload();
        await vi.advanceTimersByTimeAsync(9_999);
        expect(sent).toHaveLength(1);
        expect(sent[0]?.signal?.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(sent[0]?.signal?.aborted).toBe(true);
        const reason = sent[0]?.signal?.reason as ZerolithError | undefined;
        expect(reason?.diagnostic.code).toBe("resource_timed_out");
        await vi.advanceTimersByTimeAsync(250);
        expect(sent).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(10_000 + 500);
        expect(sent).toHaveLength(3);
        vi.useRealTimers();
        await vi.waitFor(() => expect(status?.textContent).toBe("The releases did not load."));
        expect(releases.status.get()).toBe("error");
        expect(button(container, "Try again")).toBeDefined();
    });

    it("fails at once for a missing file, and tries again from the button with focus on the heading", async () =>
    {
        const { Releases } = await import("../fixtures/release-notes/loading/src/components/releases.ts");
        const { releases } = await import("../fixtures/release-notes/loading/src/store.ts");
        serve(failing(404));
        releases.reload();
        const { container } = mount(Releases());
        const status = container.querySelector("[role=status]");
        await vi.waitFor(() => expect(status?.textContent).toBe("The releases did not load."));
        expect(sent).toHaveLength(1);
        const retry = button(container, "Try again");
        retry?.focus();
        serve(ok);
        retry?.click();
        const title = container.querySelector("h1");
        expect(document.activeElement).toBe(title);
        expect(title?.tabIndex).toBe(-1);
        expect(status?.textContent).toBe("Loading the releases");
        expect(button(container, "Try again")).toBeUndefined();
        await vi.waitFor(() => expect(status?.textContent).toBe(""));
        expect(rows(container)).toHaveLength(7);
        expect(sent).toHaveLength(1);
        expect(accessibilityIssues(container)).toEqual([]);
        const complete: Record<ResourceStatus, string> = { idle: "", pending: "", resolved: "", error: "" };
        // @ts-expect-error every status needs its sentence
        const partial: Record<ResourceStatus, string> = { idle: "", pending: "", resolved: "" };
        expect(Object.keys(partial)).toHaveLength(Object.keys(complete).length - 1);
    });

    it("shows a release's heading and title from its address while the releases load, and its notes once they do", async () =>
    {
        serve(hanging);
        await quiet(() => import("../fixtures/release-notes/release/src/router.ts"));
        const { routes } = await import("../fixtures/release-notes/release/src/routes.ts");
        const { releases } = await import("../fixtures/release-notes/release/src/store.ts");
        const router = createRouter(routes, { window: null });
        await router.navigate("/releases/9.9.9");
        const { container } = mount(router.outlet());
        expect(heading(container)).toBe("Version 9.9.9");
        expect(router.head.get().title).toBe("9.9.9 release notes");
        expect(statuses(container)).toEqual(["Loading the releases"]);
        expect(container.textContent).not.toContain("There is no release with this version.");
        serve(ok);
        releases.reload();
        await vi.waitFor(() => expect(container.textContent).toContain("There is no release with this version."));
        await router.navigate("/releases/2.2.0");
        expect(heading(container)).toBe("Version 2.2.0");
        expect(router.head.get().title).toBe("2.2.0 release notes");
        expect(rows(container)).toEqual(file[2]?.notes);
        expect(container.querySelector("p:not([role])")?.textContent).toBe("Photos in entries");
        expect(container.textContent).not.toContain("There is no release with this version.");
        expect(container.querySelector("a")?.getAttribute("href")).toBe("/releases");
        expect(container.querySelector("a")?.textContent).toBe("Every release");
        serve(failing(404));
        releases.reload();
        await vi.waitFor(() => expect(statuses(container)).toEqual(["The releases did not load."]));
        serve(ok);
        button(container, "Try again")?.click();
        expect(document.activeElement).toBe(container.querySelector("h1"));
        await vi.waitFor(() => expect(statuses(container)).toEqual([""]));
        router.dispose();
    });

    it("links each release to the address of its page", async () =>
    {
        serve(ok);
        const { Releases } = await import("../fixtures/release-notes/release/src/components/releases.ts");
        const { releases } = await import("../fixtures/release-notes/release/src/store.ts");
        releases.reload();
        await vi.waitFor(() => expect(releases.status.get()).toBe("resolved"));
        const { container } = mount(Releases());
        expect(versions(container)).toEqual(file.map((release) => release.version));
        expect([...container.querySelectorAll("li > a")].map((link) => link.getAttribute("href"))).toEqual(file.map((release) => `/releases/${release.version}`));
    });

    it("types a release's parameter and its links from the path", async () =>
    {
        const { routes } = await import("../fixtures/release-notes/release/src/routes.ts");
        const router = createRouter(routes, { window: null });
        expect(router.href("release", { version: "2.3.0" })).toBe("/releases/2.3.0");
        expect(router.href("release", { version: "a b/c" })).toBe("/releases/a%20b%2Fc");
        const unchecked = (): void =>
        {
            // @ts-expect-error a link to a release needs its version
            router.href("release");
            // @ts-expect-error the parameter is named version
            router.href("release", { verison: "2.3.0" });
        };
        const misspelled = route({
            path: "/releases/:version",
            // @ts-expect-error the view's parameters come from the path
            view: ({ params }) => params.verison
        });
        expect(typeof unchecked).toBe("function");
        expect(misspelled.path).toBe("/releases/:version");
        router.dispose();
    });

    it("writes dates in the reader's language, on the day the file says", async () =>
    {
        serve(ok);
        const { releaseDate } = await import("../fixtures/release-notes/dates/src/dates.ts");
        expect(navigator.language).toBe("en-US");
        expect(releaseDate("2026-10-20")).toBe("October 20, 2026");
        expect(releaseDate("2026-01-12")).toBe("January 12, 2026");
        for (const [language, written] of [["de-DE", "20. Oktober 2026"], ["en-GB", "20 October 2026"]])
        {
            Object.defineProperty(navigator, "language", { configurable: true, get: () => language });
            try
            {
                const fresh = `../fixtures/release-notes/dates/src/dates.ts?language=${language ?? ""}`;
                const dates = await import(/* @vite-ignore */ fresh) as typeof DatesModule;
                expect(dates.releaseDate("2026-10-20")).toBe(written);
            }
            finally
            {
                Reflect.deleteProperty(navigator, "language");
            }
        }
        const newYork = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/New_York" });
        expect(newYork.format(Date.parse("2026-10-20"))).toBe("October 19, 2026");
        expect(navigator.language).toBe("en-US");
    });

    it("builds one formatter for every date it writes in a language", async () =>
    {
        Object.defineProperty(navigator, "language", { configurable: true, get: () => "fr-FR" });
        const built = vi.spyOn(Intl, "DateTimeFormat");
        try
        {
            const fresh = "../fixtures/release-notes/dates/src/dates.ts?language=fr";
            const dates = await import(/* @vite-ignore */ fresh) as typeof DatesModule;
            const written = file.map((release) => dates.releaseDate(release.date));
            expect(written[0]).toBe("20 octobre 2026");
            expect(built).toHaveBeenCalledTimes(1);
            expect(built).toHaveBeenCalledWith("fr-FR", { dateStyle: "long", timeZone: "UTC" });
        }
        finally
        {
            built.mockRestore();
            Reflect.deleteProperty(navigator, "language");
        }
    });

    it("shows each date on the list and on the release page, with the file's date beside it", async () =>
    {
        serve(ok);
        await quiet(() => import("../fixtures/release-notes/dates/src/router.ts"));
        const { Releases } = await import("../fixtures/release-notes/dates/src/components/releases.ts");
        const { routes } = await import("../fixtures/release-notes/dates/src/routes.ts");
        const { releases } = await import("../fixtures/release-notes/dates/src/store.ts");
        await vi.waitFor(() => expect(releases.status.get()).toBe("resolved"));
        const list = mount(Releases()).container;
        const times = [...list.querySelectorAll("li time")];
        expect(times.map((time) => time.getAttribute("datetime"))).toEqual(file.map((release) => release.date));
        expect(times[0]?.textContent).toBe("October 20, 2026");
        expect(rows(list)[0]).toBe("Version 2.3.0 October 20, 2026 A calendar of your entries");
        const router = createRouter(routes, { window: null });
        await router.navigate("/releases/2.3.0");
        const page = mount(router.outlet()).container;
        expect(page.querySelector("p:not([role])")?.textContent?.replace(/\s+/g, " ")).toBe("A calendar of your entries, released October 20, 2026.");
        expect(page.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-20");
        router.dispose();
    });

    it("says nothing about a search while the releases load, and counts once they arrive", async () =>
    {
        serve(hanging);
        await quiet(() => import("../fixtures/release-notes/search/src/router.ts"));
        const { Releases } = await import("../fixtures/release-notes/search/src/components/releases.ts");
        const { releases } = await import("../fixtures/release-notes/search/src/store.ts");
        vi.useFakeTimers();
        const { container } = mount(() => Releases());
        typeInto(searchField(container), "photo");
        vi.advanceTimersByTime(300);
        expect(statuses(container)).toEqual(["Loading the releases", ""]);
        vi.useRealTimers();
        serve(ok);
        releases.reload();
        await vi.waitFor(() => expect(statuses(container)).toEqual(["", "2 releases match."]));
        expect(versions(container)).toEqual(["2.2.1", "2.2.0"]);
    });

    it("filters once typing pauses for 300 milliseconds, by every word in any case, and announces the count", async () =>
    {
        serve(ok);
        const { Releases } = await import("../fixtures/release-notes/search/src/components/releases.ts");
        const { releases } = await import("../fixtures/release-notes/search/src/store.ts");
        releases.reload();
        await vi.waitFor(() => expect(releases.status.get()).toBe("resolved"));
        vi.useFakeTimers();
        const { container } = mount(() => Releases());
        const field = searchField(container);
        const summary = (): string | undefined => statuses(container)[1];
        expect(versions(container)).toHaveLength(7);
        expect(summary()).toBe("");
        typeInto(field, "ph");
        vi.advanceTimersByTime(200);
        typeInto(field, "photo");
        vi.advanceTimersByTime(299);
        expect(versions(container)).toHaveLength(7);
        expect(field.value).toBe("photo");
        vi.advanceTimersByTime(1);
        expect(versions(container)).toEqual(["2.2.1", "2.2.0"]);
        expect(summary()).toBe("2 releases match.");
        const region = container.querySelectorAll("[role=status]")[1];
        typeInto(field, "Photo IMPORT");
        vi.advanceTimersByTime(300);
        expect(versions(container)).toEqual(["2.2.1"]);
        expect(summary()).toBe("1 release matches.");
        typeInto(field, "2.2");
        vi.advanceTimersByTime(300);
        expect(versions(container)).toEqual(["2.2.1", "2.2.0"]);
        typeInto(field, "export");
        vi.advanceTimersByTime(300);
        expect(versions(container)).toEqual(["2.1.0"]);
        typeInto(field, "camera");
        vi.advanceTimersByTime(300);
        expect(versions(container)).toEqual(["2.2.0"]);
        typeInto(field, "photo");
        vi.advanceTimersByTime(300);
        const announced = new MutationObserver(() => undefined);
        announced.observe(region as Node, { childList: true, characterData: true, subtree: true });
        typeInto(field, "2.2");
        vi.advanceTimersByTime(300);
        expect(summary()).toBe("2 releases match.");
        expect(announced.takeRecords()).toEqual([]);
        announced.disconnect();
        typeInto(field, "sync");
        vi.advanceTimersByTime(300);
        expect(versions(container)).toEqual(["2.0.0"]);
        typeInto(field, "xyz");
        vi.advanceTimersByTime(300);
        expect(versions(container)).toEqual([]);
        expect(summary()).toBe("No release matches.");
        typeInto(field, "  ");
        vi.advanceTimersByTime(300);
        expect(versions(container)).toHaveLength(7);
        expect(summary()).toBe("");
        expect(container.querySelectorAll("[role=status]")[1]).toBe(region);
        expect(container.querySelector("search input")).toBe(field);
        expect(getComputedStyle(container.querySelector("search") as Element).marginTop).toBe("16px");
        expect(accessibilityIssues(container)).toEqual([]);
    });

    it("opens on the search in the address at once, and follows each pause in place", async () =>
    {
        const { router, Releases } = await finished();
        await router.navigate("/releases?q=photo", { replace: true });
        const scrolled = vi.spyOn(window, "scrollTo");
        const { container } = mount(() => Releases());
        const field = searchField(container);
        expect(field.value).toBe("photo");
        expect(versions(container)).toEqual(["2.2.1", "2.2.0"]);
        expect(statuses(container)[1]).toBe("2 releases match.");
        expect(scrolled).not.toHaveBeenCalled();
        scrolled.mockRestore();
        expect(getComputedStyle(container.querySelector("search") as Element).marginTop).toBe("16px");
        const entries = history.length;
        vi.useFakeTimers();
        typeInto(field, "photo import");
        vi.advanceTimersByTime(299);
        expect(location.search).toBe("?q=photo");
        expect(versions(container)).toEqual(["2.2.1", "2.2.0"]);
        vi.advanceTimersByTime(1);
        expect(location.search).toBe("?q=photo+import");
        vi.useRealTimers();
        expect(versions(container)).toEqual(["2.2.1"]);
        expect(statuses(container)[1]).toBe("1 release matches.");
        expect(history.length).toBe(entries);
        expect(location.pathname).toBe("/releases");
        typeInto(field, "");
        await vi.waitFor(() => expect(location.href).toBe(new URL("/releases", location.href).href));
        expect(versions(container)).toHaveLength(7);
        expect(history.length).toBe(entries);
        typeInto(field, "a&b#c d");
        await vi.waitFor(() => expect(location.search).not.toBe(""));
        expect(new URLSearchParams(location.search.slice(1)).get("q")).toBe("a&b#c d");
        expect(field.value).toBe("a&b#c d");
    });

    it("keeps the page, the field's focus, and the scroll position through each pause, where a link to a search builds the page again", async () =>
    {
        const { router } = await finished();
        await router.navigate("/releases", { replace: true });
        const { container } = mount(router.outlet());
        await settle();
        const field = searchField(container);
        field.focus();
        const scrolled = vi.spyOn(window, "scrollTo");
        typeInto(field, "sync");
        await vi.waitFor(() => expect(location.search).toBe("?q=sync"));
        expect(scrolled).not.toHaveBeenCalled();
        scrolled.mockRestore();
        expect(versions(container)).toEqual(["2.0.0"]);
        expect(searchField(container)).toBe(field);
        expect(document.activeElement).toBe(field);
        await router.navigate("/releases?q=photo", { replace: true });
        expect(field.isConnected).toBe(false);
        expect(searchField(container).value).toBe("photo");
        expect(versions(container)).toEqual(["2.2.1", "2.2.0"]);
    });

    it("follows a link that clears the search, and the back button that returns it", async () =>
    {
        const { router } = await finished();
        await router.navigate("/releases?q=photo");
        const { container } = mount(router.outlet());
        expect(searchField(container).value).toBe("photo");
        const link = document.createElement("a");
        link.href = "/releases";
        document.body.append(link);
        link.click();
        link.remove();
        await vi.waitFor(() => expect(searchField(container).value).toBe(""));
        expect(location.search).toBe("");
        expect(versions(container)).toHaveLength(7);
        expect(statuses(container)[1]).toBe("");
        history.back();
        await vi.waitFor(() => expect(searchField(container).value).toBe("photo"));
        expect(location.search).toBe("?q=photo");
        expect(versions(container)).toEqual(["2.2.1", "2.2.0"]);
    });

    it("writes the same search again once a link has cleared it", async () =>
    {
        const { router } = await finished();
        await router.navigate("/releases?q=photo");
        const { container } = mount(router.outlet());
        const link = document.createElement("a");
        link.href = "/releases";
        document.body.append(link);
        link.click();
        link.remove();
        await vi.waitFor(() => expect(searchField(container).value).toBe(""));
        expect(location.search).toBe("");
        typeInto(searchField(container), "photo");
        await vi.waitFor(() => expect(location.search).toBe("?q=photo"));
        expect(versions(container)).toEqual(["2.2.1", "2.2.0"]);
    });

    it("writes nothing to the address when a pause ends after the page was left", async () =>
    {
        const { router } = await finished();
        await router.navigate("/releases", { replace: true });
        const { container } = mount(router.outlet());
        typeInto(searchField(container), "sync");
        await router.navigate("/releases/2.3.0");
        await new Promise((resolve) => setTimeout(resolve, 350));
        expect(location.pathname).toBe("/releases/2.3.0");
        expect(location.search).toBe("");
        await router.navigate("/releases", { replace: true });
    });

    it("goes to a release by its link without a reload, with its title, and back to the search", async () =>
    {
        const { router } = await finished();
        await router.navigate("/releases?q=photo");
        const { container } = mount(router.outlet());
        let prevented: boolean | undefined;
        document.addEventListener("click", (event) =>
        {
            prevented = event.defaultPrevented;
        }, { once: true });
        container.querySelector<HTMLAnchorElement>("a[href=\"/releases/2.2.0\"]")?.click();
        await vi.waitFor(() => expect(heading(container)).toBe("Version 2.2.0"));
        expect(prevented).toBe(true);
        expect(location.pathname).toBe("/releases/2.2.0");
        expect(document.title).toBe("2.2.0 release notes");
        expect(rows(container)).toEqual(file[2]?.notes);
        await settle();
        expect(document.activeElement).toBe(container.querySelector("h1"));
        expect(router.matches(router.href("releases"), { exact: false }).get()).toBe(true);
        expect(router.matches(router.href("releases"), { exact: true }).get()).toBe(false);
        history.back();
        await vi.waitFor(() => expect(heading(container)).toBe("Release notes"));
        await settle();
        expect(document.activeElement).toBe(container.querySelector("h1"));
        expect(location.search).toBe("?q=photo");
        expect(searchField(container).value).toBe("photo");
        expect(versions(container)).toEqual(["2.2.1", "2.2.0"]);
        expect(router.matches(router.href("releases"), { exact: false }).get()).toBe(true);
    });

    it("leaves the scroll position to the router when a page's heading takes focus", async () =>
    {
        const { router } = await finished();
        await router.navigate("/releases/2.3.0");
        document.body.style.minHeight = "5000px";
        try
        {
            scrollTo(0, 1000);
            const { container } = mount(router.outlet());
            await settle();
            expect(document.activeElement).toBe(container.querySelector("h1"));
            expect(window.scrollY).toBeGreaterThan(900);
        }
        finally
        {
            document.body.style.minHeight = "";
            scrollTo(0, 0);
        }
    });

    it("draws no focus ring around a page's heading, whatever the page's styles give focused elements", async () =>
    {
        const { router } = await finished();
        await router.navigate("/releases/2.3.0");
        const rule = document.createElement("style");
        rule.textContent = "h1:focus { outline: 2px solid red; }";
        document.head.append(rule);
        try
        {
            const { container } = mount(router.outlet());
            await settle();
            const title = container.querySelector("h1");
            expect(document.activeElement).toBe(title);
            expect(getComputedStyle(title as Element).outlineStyle).toBe("none");
            expect(title?.tabIndex).toBe(-1);
        }
        finally
        {
            rule.remove();
        }
    });

    it("opens a release from its own address, with its title and its date", async () =>
    {
        const { router } = await finished();
        await router.navigate("/releases/2.3.0");
        const { container } = mount(router.outlet());
        expect(heading(container)).toBe("Version 2.3.0");
        expect(document.title).toBe("2.3.0 release notes");
        expect(container.querySelector("time")?.textContent).toBe("October 20, 2026");
        expect(rows(container)).toEqual(file[0]?.notes);
    });

    it("stops the page's debounce when cleanup unmounts a page mounted from a function, and not one called before mount", async () =>
    {
        const { router, Releases } = await finished();
        await router.navigate("/releases", { replace: true });
        const owned = mount(() => Releases()).container;
        typeInto(searchField(owned), "sync");
        cleanup();
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(location.search).toBe("");
        const unowned = mount(Releases()).container;
        typeInto(searchField(unowned), "sync");
        cleanup();
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(location.search).toBe("?q=sync");
    });
});
