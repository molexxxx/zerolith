// Executed examples for the custom elements guide.
import { afterEach, describe, expect, it } from "vitest";
import { computed, html } from "zerolith";
import { define } from "zerolith/element";

afterEach(() =>
{
    document.querySelector("#app")?.remove();
});

describe("custom elements guide", () =>
{
    it("define", () =>
    {
        // #region define
        define("note-count", {
            props: ["label", "count"],
            view: ({ label, count }, element) =>
            {
                const total = computed(() => Number(count.get() ?? 0));
                const reset = () =>
                    element.dispatchEvent(new CustomEvent("reset", { bubbles: true }));
                return html`
                    <span>${label}: ${total}</span>
                    <button @click=${reset}>Reset</button>`;
            }
        });
        // #endregion define
        const host = document.createElement("main");
        host.id = "app";
        host.innerHTML = "<note-count label=\"Drafts\" count=\"2\"></note-count>";
        document.body.append(host);
        expect(host.querySelector("span")?.textContent).toBe("Drafts: 2");
        // #region use
        const counter = document.querySelector("note-count") as HTMLElement & { count: number };
        counter.count = 5;                      // a property keeps its type
        counter.addEventListener("reset", () =>
        {
            counter.count = 0;
        });
        // #endregion use
        expect(counter.querySelector("span")?.textContent).toBe("Drafts: 5");
        counter.querySelector("button")?.click();
        expect(counter.querySelector("span")?.textContent).toBe("Drafts: 0");
    });
});
