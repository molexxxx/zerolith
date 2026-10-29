// Executed examples for the custom elements guide.
import { afterEach, describe, expect, it } from "vitest";
import { computed, html } from "zerolith";
import { define } from "zerolith/element";

let host: HTMLElement | undefined;

afterEach(() =>
{
    host?.remove();
});

describe("custom elements guide", () =>
{
    it("define", () =>
    {
        // #region define
        define("note-count", {
            props: ["label", "count"],
            view: ({ label, count }, element) => html`
                <span>${label}: ${computed(() => Number(count.get() ?? 0))}</span>
                <button @click=${() => element.dispatchEvent(new CustomEvent("reset", { bubbles: true }))}>Reset</button>`
        });
        // #endregion define
        host = document.createElement("div");
        document.body.append(host);
        // #region use
        host.innerHTML = "<note-count label=\"Drafts\" count=\"2\"></note-count>";    // from any HTML, or from React, Vue, or Angular
        const element = host.firstElementChild as HTMLElement & { count: number };
        element.count = 5;                                                           // a property keeps its type
        // #endregion use
        expect(element.querySelector("span")?.textContent).toBe("Drafts: 5");
        let resets = 0;
        host.addEventListener("reset", () =>
        {
            resets += 1;
        });
        element.querySelector("button")?.click();
        expect(resets).toBe(1);
    });
});
