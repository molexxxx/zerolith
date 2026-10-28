import { afterEach, describe, expect, it } from "vitest";
import { type Root, css, html, render } from "zerolith";

let root: Root | undefined;
let host: HTMLElement | undefined;

function mount(view: unknown): HTMLElement
{
    host = document.createElement("div");
    document.body.append(host);
    root = render(view, host);
    return host;
}

afterEach(() =>
{
    root?.dispose();
    root = undefined;
    host?.remove();
    host = undefined;
});

describe("scoped css in the document", () =>
{
    it("adopts one sheet per distinct text and applies rules to the scoped root and its interior", () =>
    {
        const before = document.adoptedStyleSheets.length;
        const card = css`
            :scope { padding: 7px; }
            p { margin-left: 3px; }
        `;
        const duplicate = css`
            :scope { padding: 7px; }
            p { margin-left: 3px; }
        `;
        expect(duplicate).toBe(card);
        expect(document.adoptedStyleSheets.length).toBe(before + 1);

        const el = mount(html`<section class="card ${card}"><p>inner</p></section><p>outside</p>`);
        const section = el.querySelector("section") as HTMLElement;
        expect(getComputedStyle(section).paddingTop).toBe("7px");
        expect(getComputedStyle(el.querySelector("section p") as HTMLElement).marginLeft).toBe("3px");
        expect(getComputedStyle(el.querySelector("section + p") as HTMLElement).marginLeft).toBe("0px");
    });

    it("lets a parent style a nested component's root but not its interior", () =>
    {
        const outer = css`p { color: rgb(255, 0, 0); } .child { margin-top: 5px; }`;
        const inner = css`:scope { padding: 2px; }`;
        const el = mount(html`
            <div class=${outer}>
                <p>mine</p>
                <article class="child ${inner}"><p>theirs</p></article>
            </div>`);
        const mine = el.querySelector("div > p") as HTMLElement;
        const child = el.querySelector("article") as HTMLElement;
        const theirs = el.querySelector("article > p") as HTMLElement;
        expect(getComputedStyle(mine).color).toBe("rgb(255, 0, 0)");
        expect(getComputedStyle(child).marginTop).toBe("5px");
        expect(getComputedStyle(child).paddingTop).toBe("2px");
        expect(getComputedStyle(theirs).color).not.toBe("rgb(255, 0, 0)");
    });
});
