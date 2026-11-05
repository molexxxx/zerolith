// Executed examples for the browser guide.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type View, computed, html, render, signal } from "zerolith";
import { settle } from "@zerolith/test";
import { inView, online, size, visible, windowSize } from "@zerolith/browser";
import { pretend, restorePretended } from "../helpers.ts";

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
    restorePretended();
    scrollTo(0, 0);
});

/** Waits until the page shows `text`. */
function shows(text: string): Promise<void>
{
    return vi.waitFor(() => expect(host.textContent).toContain(text), { timeout: 2000, interval: 10 });
}

describe("browser guide", () =>
{
    it("online", async () =>
    {
        // #region online
        const isOnline = online();
        const status = computed(() => (isOnline.get() ? "Online" : "Offline"));

        render(html`<p role="status">${status}</p>`, "#app");
        // #endregion online
        expect(host.textContent).toContain("Online");
        pretend(navigator, "onLine", false);
        dispatchEvent(new Event("offline"));
        await settle();
        expect(host.textContent).toContain("Offline");
    });

    it("visible", async () =>
    {
        // #region visible
        const isVisible = visible();
        const player = computed(() => (isVisible.get() ? "Playing" : "Paused"));

        render(html`<p>${player}</p>`, "#app");
        // #endregion visible
        expect(host.textContent).toContain("Playing");
        pretend(document, "visibilityState", "hidden");
        document.dispatchEvent(new Event("visibilitychange"));
        await settle();
        expect(host.textContent).toContain("Paused");
    });

    it("windowSize", async () =>
    {
        // #region windowSize
        const viewport = windowSize();
        const width = computed(() => viewport.get().width);
        const wide = computed(() => width.get() >= 960);
        const layout = computed(() => (wide.get() ? "three columns" : "one column"));

        render(html`<p>Showing ${layout} in ${width}px</p>`, "#app");
        // #endregion windowSize
        pretend(window, "innerWidth", 1200);
        dispatchEvent(new Event("resize"));
        await settle();
        expect(host.textContent).toContain("Showing three columns in 1200px");
        pretend(window, "innerWidth", 500);
        dispatchEvent(new Event("resize"));
        await settle();
        expect(host.textContent).toContain("Showing one column in 500px");
    });

    it("size", async () =>
    {
        // #region size
        function Panel(): View
        {
            const panel = signal<Element | undefined>(undefined);
            const box = size(panel);
            const width = computed(() => box.get().width);
            const columns = computed(() => Math.floor(width.get() / 240));
            return html`
                <section ref=${panel} style="width: 720px">
                    <p>${columns} columns fit in ${width}px.</p>
                </section>`;
        }

        render(() => Panel(), "#app");
        // #endregion size
        expect(host.textContent).not.toContain("NaN");
        await shows("3 columns fit in 720px.");
    });

    it("inView", async () =>
    {
        // #region inView
        function Gallery(): View
        {
            const slot = signal<Element | undefined>(undefined);
            const near = inView(slot, { rootMargin: "200px" });
            const picture = computed(() => (near.get() ? "Loaded" : "Not yet"));
            return html`
                <div style="height: 300vh">Scroll down for the gallery.</div>
                <figure ref=${slot}><figcaption>${picture}</figcaption></figure>`;
        }

        render(() => Gallery(), "#app");
        // #endregion inView
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(host.textContent).toContain("Not yet");
        host.querySelector("figure")?.scrollIntoView();
        await shows("Loaded");
    });
});
