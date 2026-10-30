import { afterEach, describe, expect, it } from "vitest";
import { type DevtoolsHandle, describeValue, mountDevtools } from "@zerolith/devtools";
import { type DevtoolsHook, type Root, html, render, signal } from "zerolith";

let handle: DevtoolsHandle | undefined;
let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() =>
{
    handle?.dispose();
    root?.dispose();
    host?.remove();
});

async function frame(): Promise<void>
{
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/** The number of reactive nodes the development hook holds. */
function tracked(): number
{
    return ((globalThis as { __ZEROLITH_DEVTOOLS__?: DevtoolsHook }).__ZEROLITH_DEVTOOLS__?.nodes() ?? []).length;
}

describe("inspector", () =>
{
    it("lists application signals and roots but not its own, and updates values live", async () =>
    {
        host = document.createElement("main");
        host.id = "app";
        document.body.append(host);
        const count = signal(1, { name: "count" });
        root = render(html`<p>${count}</p>`, host);

        handle = mountDevtools({ open: true });
        await frame();
        const dock = document.querySelector("[data-zerolith-devtools] aside") as HTMLElement;
        expect(dock).not.toBeNull();
        const row = Array.from(dock.querySelectorAll("tbody tr")).find((tr) => tr.textContent?.includes("count"));
        expect(row?.textContent).toContain("state");
        expect(row?.textContent).toContain("1");
        expect(Array.from(dock.querySelectorAll("tbody tr")).some((tr) => tr.textContent?.includes("Signals"))).toBe(false);

        count.set(5);
        await frame();
        expect(Array.from(dock.querySelectorAll("tbody tr")).find((tr) => tr.textContent?.includes("count"))?.textContent).toContain("5");

        (dock.querySelector("button[role=tab]:nth-of-type(2)") as HTMLButtonElement).click();
        await frame();
        expect(dock.querySelector("tbody")?.textContent).toContain("main#app");

        handle.toggle(false);
        await frame();
        expect(document.querySelector("[data-zerolith-devtools] aside")).toBeNull();
        expect(document.querySelector("[data-zerolith-devtools] button")).not.toBeNull();
    });

    it("opens from the launcher and the shortcut, lists signals created later, and settles", async () =>
    {
        host = document.createElement("main");
        document.body.append(host);
        const count = signal(1, { name: "count" });
        root = render(html`<p>${count}</p>`, host);

        handle = mountDevtools();
        await frame();
        (document.querySelector("[data-zerolith-devtools] button") as HTMLButtonElement).click();
        await frame();
        const later = signal("x", { name: "later" });
        await frame();
        await frame();
        const settled = tracked();
        await frame();
        await frame();
        expect(tracked()).toBe(settled);
        const dock = document.querySelector("[data-zerolith-devtools] aside") as HTMLElement;
        expect(Array.from(dock.querySelectorAll("tbody tr")).some((tr) => tr.textContent?.includes("later"))).toBe(true);
        expect(later.get()).toBe("x");

        handle.toggle(false);
        await frame();
        document.dispatchEvent(new KeyboardEvent("keydown", { altKey: true, shiftKey: true, code: "KeyZ" }));
        await frame();
        expect(document.querySelector("[data-zerolith-devtools] aside")).not.toBeNull();
    });

    it("describes values compactly", () =>
    {
        expect(describeValue("x")).toBe("\"x\"");
        expect(describeValue({ a: 1 })).toBe("{\"a\":1}");
        expect(describeValue(document.createElement("div"))).toBe("<div>");
        expect(describeValue(undefined)).toBe("undefined");
    });
});
