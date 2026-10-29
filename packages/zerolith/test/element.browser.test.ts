import { afterEach, describe, expect, it } from "vitest";
import { computed, html } from "zerolith";
import { define } from "zerolith/element";
import { renderToString } from "zerolith/ssr";

let host: HTMLElement | undefined;

afterEach(() =>
{
    host?.remove();
});

define("zl-greeting", {
    props: ["name", "count"],
    view: ({ name, count }, element) => html`<p>Hello ${computed(() => name.get() ?? "stranger")}, ${computed(() => (count.get() as number | undefined) ?? 0)}</p><button @click=${() => element.dispatchEvent(new CustomEvent("wave"))}>Wave</button>`
});

describe("define", () =>
{
    it("renders a view inside a custom element and feeds attributes and properties into its signals", () =>
    {
        host = document.createElement("div");
        host.innerHTML = "<zl-greeting name=\"Ada\"></zl-greeting>";
        document.body.append(host);
        const element = host.firstElementChild as HTMLElement & { name: unknown; count: unknown };
        expect(element.querySelector("p")?.textContent).toBe("Hello Ada, 0");

        element.setAttribute("name", "Grace");
        expect(element.querySelector("p")?.textContent).toBe("Hello Grace, 0");
        element.count = 3;
        expect(element.querySelector("p")?.textContent).toBe("Hello Grace, 3");
        expect(element.name).toBe("Grace");
        element.removeAttribute("name");
        expect(element.querySelector("p")?.textContent).toBe("Hello stranger, 3");

        let waves = 0;
        element.addEventListener("wave", () =>
        {
            waves += 1;
        });
        element.querySelector("button")?.click();
        expect(waves).toBe(1);

        element.remove();
        expect(element.querySelector("p")).toBeNull();
    });

    it("keeps a property assigned before upgrade and hydrates server-rendered content", () =>
    {
        const early = document.createElement("zl-later") as HTMLElement & { label: unknown };
        early.label = "early";
        define("zl-later", { props: ["label"], view: ({ label }) => html`<b>${label}</b>` });
        host = document.createElement("div");
        host.append(early);
        document.body.append(host);
        expect(early.querySelector("b")?.textContent).toBe("early");

        const markup = renderToString(html`<b>${"server"}</b>`);
        const rendered = document.createElement("div");
        rendered.innerHTML = `<zl-later label="server">${markup}</zl-later>`;
        host.append(rendered);
        const element = rendered.firstElementChild as HTMLElement;
        expect(element.querySelectorAll("b")).toHaveLength(1);
        expect(element.querySelector("b")?.textContent).toBe("server");
    });

    it("ignores a second definition of the same name", () =>
    {
        define("zl-greeting", { props: [], view: () => html`<i>other</i>` });
        host = document.createElement("div");
        host.innerHTML = "<zl-greeting></zl-greeting>";
        document.body.append(host);
        expect(host.querySelector("p")?.textContent).toBe("Hello stranger, 0");
    });
});
