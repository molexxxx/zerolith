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
        host.id = "app";
        document.body.append(host);
        // #region hydrate
        const count = signal(1);
        const view = () => html`
            <button @click=${() => count.set(count.get() + 1)}>Clicked ${count} times</button>`;

        // On the server, the markup goes into the page inside <div id="app">:
        const markup = renderToString(view());
        // #endregion hydrate
        host.innerHTML = markup;
        const served = host.querySelector("button");
        // #region hydrate

        // In the browser, the same view adopts that markup:
        const app = hydrate(view(), "#app");    // app.mismatches is empty: nothing differed
        // #endregion hydrate
        result = app;
        expect(app.mismatches).toEqual([]);
        expect(host.querySelector("button")).toBe(served);
        served?.click();
        expect(served?.textContent).toBe("Clicked 2 times");
    });
});
