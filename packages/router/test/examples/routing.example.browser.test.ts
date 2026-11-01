// Executed examples for the routing guide: the application in this folder,
// started as its main module starts it and used through its links.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() =>
{
    document.querySelector("#app")?.remove();
    history.replaceState(null, "", "/");
});

describe("routing guide", () =>
{
    it("renders pages as components inside the layout and moves between them", async () =>
    {
        history.replaceState(null, "", "/");
        const host = document.createElement("div");
        host.id = "app";
        document.body.append(host);
        const stopped = vi.spyOn(window, "clearInterval");
        const { router } = await import("./router.ts");
        await import("./main.tsx");
        const heading = (): string | null | undefined => host.querySelector("main h1")?.textContent;
        try
        {
            expect(heading()).toBe("Releases");
            expect(router.href("release", { tag: "v1" })).toBe("/releases/v1");
            expect(host.querySelector("nav a[aria-current=\"page\"]")?.textContent).toBe("Releases");

            host.querySelector<HTMLAnchorElement>("main a[href=\"/releases/v1\"]")?.click();
            await vi.waitFor(() => expect(heading()).toBe("First"));
            expect(document.title).toBe("First");
            expect(host.querySelector("nav a[aria-current=\"page\"]")).toBeNull();
            host.querySelector<HTMLButtonElement>("main button")?.click();
            expect(Array.from(host.querySelectorAll("main li"), (item) => item.textContent)).toEqual(["A typed route table", "Links checked by the compiler"]);

            await router.navigate("/releases/v9");
            expect(heading()).toBe("No release named v9");

            host.querySelector<HTMLAnchorElement>("nav a[href=\"/settings\"]")?.click();
            await vi.waitFor(() => expect(heading()).toBe("Settings"));
            expect(host.querySelector("nav a[aria-current=\"page\"]")?.textContent).toBe("Settings");
            host.querySelector<HTMLButtonElement>("main button")?.click();
            await vi.waitFor(() => expect(heading()).toBe("Releases"));
            expect(stopped).toHaveBeenCalled();

            await router.navigate("/missing");
            expect(heading()).toBe("Not found");
            expect(host.querySelector("main p")?.textContent).toBe("Nothing lives at /missing.");
        }
        finally
        {
            stopped.mockRestore();
            router.dispose();
        }
    });
});
