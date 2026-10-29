// Executed example for the hydration section of the server rendering guide.
import { afterEach, describe, expect, it } from "vitest";
import { type HydrateResult, html, hydrate, signal } from "zerolith";
import { renderToString } from "zerolith/ssr";

let host: HTMLElement | undefined;
let result: HydrateResult | undefined;

afterEach(() =>
{
    result?.dispose();
    host?.remove();
});

describe("hydration guide", () =>
{
    it("hydrate", () =>
    {
        host = document.createElement("div");
        document.body.append(host);
        const container = host;
        // #region hydrate
        const count = signal(1);
        const view = () => html`<button @click=${() => count.set(count.get() + 1)}>Clicked ${count} times</button>`;

        // On the server:
        container.innerHTML = renderToString(view());

        // In the browser, with the same view:
        const handle = hydrate(view(), container);
        const button = container.querySelector("button");
        button?.click();

        expect(handle.mismatches).toEqual([]);
        expect(button?.textContent).toBe("Clicked 2 times");
        expect(container.querySelector("button")).toBe(button);    // the server's element, not a replacement
        // #endregion hydrate
        result = handle;
    });
});
