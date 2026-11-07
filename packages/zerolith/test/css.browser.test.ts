import { afterEach, describe, expect, it } from "vitest";
import { type Renderable, type Root, css, html, hydrate, render } from "zerolith";
import { define } from "zerolith/element";
import { styleFile } from "zerolith/internal";
import { renderToString } from "zerolith/ssr";

let root: Root | undefined;
let host: HTMLElement | undefined;

function mount(view: Renderable | (() => Renderable)): HTMLElement
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

function shadowHost(): ShadowRoot
{
    host = document.createElement("div");
    document.body.append(host);
    return host.attachShadow({ mode: "open" });
}

describe("scoped css in a shadow root", () =>
{
    it("reaches a view rendered into a shadow root, from stylesheets made before and after it, once each", () =>
    {
        const earlier = css`:scope { padding: 11px; }`;
        const shadow = shadowHost();
        const documentSheets = document.adoptedStyleSheets.length;
        root = render(html`<section class=${earlier}>first</section><aside></aside>`, shadow);
        const section = shadow.querySelector("section") as HTMLElement;
        expect(getComputedStyle(section).paddingTop).toBe("11px");
        const adopted = shadow.adoptedStyleSheets.length;
        expect(adopted).toBeGreaterThan(0);
        expect(document.adoptedStyleSheets.length).toBe(documentSheets);

        const again = render(html`<p>second</p>`, shadow.querySelector("aside") as HTMLElement);
        expect(shadow.adoptedStyleSheets.length).toBe(adopted);
        again.dispose();

        const later = css`:scope { margin-top: 13px; }`;
        expect(shadow.adoptedStyleSheets.length).toBe(adopted + 1);
        expect(document.adoptedStyleSheets.length).toBe(documentSheets + 1);
        const aside = shadow.querySelector("aside") as HTMLElement;
        aside.className = String(later);
        expect(getComputedStyle(aside).marginTop).toBe("13px");
    });

    it("reaches a custom element inside a shadow root and one hydrated there", () =>
    {
        const styled = css`:scope { padding: 17px; }`;
        define("zl-styled", { props: [], view: () => html`<p class=${styled}>styled</p>` });
        const shadow = shadowHost();
        const element = document.createElement("zl-styled");
        shadow.append(element);
        expect(getComputedStyle(element.querySelector("p") as HTMLElement).paddingTop).toBe("17px");

        const place = document.createElement("div");
        const nested = document.createElement("div");
        const other = nested.attachShadow({ mode: "open" });
        document.body.append(nested);
        other.append(place);
        place.innerHTML = renderToString(html`<p class=${styled}>served</p>`);
        const hydrated = hydrate(() => html`<p class=${styled}>served</p>`, place);
        expect(hydrated.mismatches).toHaveLength(0);
        expect(getComputedStyle(place.querySelector("p") as HTMLElement).paddingTop).toBe("17px");
        hydrated.dispose();
        nested.remove();
    });

    it("changes inside the shadow root when a stylesheet file changes", () =>
    {
        const card = styleFile("src/shadow-card.css", ":scope { padding: 4px; }");
        const shadow = shadowHost();
        root = render(html`<section class=${card}>card</section>`, shadow);
        const section = shadow.querySelector("section") as HTMLElement;
        expect(getComputedStyle(section).paddingTop).toBe("4px");
        const adopted = shadow.adoptedStyleSheets.length;
        styleFile("src/shadow-card.css", ":scope { padding: 9px; }");
        expect(getComputedStyle(section).paddingTop).toBe("9px");
        expect(shadow.adoptedStyleSheets.length).toBe(adopted);
    });

    it("adds nothing twice to a shadow root that already adopted the document's stylesheets", () =>
    {
        void css`:scope { padding: 21px; }`;
        const shadow = shadowHost();
        shadow.adoptedStyleSheets = [...document.adoptedStyleSheets];
        const adopted = shadow.adoptedStyleSheets.length;
        root = render(html`<p>inner</p>`, shadow);
        expect(shadow.adoptedStyleSheets).toHaveLength(adopted);
    });

    it("renders into a detached element and a fragment as it does in the page", () =>
    {
        void css`:scope { padding: 23px; }`;
        const detached = document.createElement("div");
        const view = render(html`<p>away</p>`, detached);
        expect(detached.querySelector("p")?.textContent).toBe("away");
        view.dispose();
        const fragment = document.createDocumentFragment();
        const inFragment = render(html`<p>held</p>`, fragment);
        expect(fragment.querySelector("p")?.textContent).toBe("held");
        inFragment.dispose();
    });

    it("leaves a shadow root with no view in it alone, and the sheets a shadow root adopted itself", () =>
    {
        const own = new CSSStyleSheet();
        own.replaceSync("p { margin-left: 2px; }");
        const shadow = shadowHost();
        shadow.adoptedStyleSheets = [own];
        const bare = document.createElement("div");
        const bareShadow = bare.attachShadow({ mode: "open" });
        document.body.append(bare);
        root = render(html`<p>inner</p>`, shadow);
        void css`:scope { padding: 19px; }`;
        expect(shadow.adoptedStyleSheets[0]).toBe(own);
        expect(getComputedStyle(shadow.querySelector("p") as HTMLElement).marginLeft).toBe("2px");
        expect(bareShadow.adoptedStyleSheets).toHaveLength(0);
        bare.remove();
    });
});

describe("stylesheet files in the document", () =>
{
    it("adopts a file's stylesheet and replaces its rules in place when the file changes", () =>
    {
        const before = document.adoptedStyleSheets.length;
        const card = styleFile("src/live-card.css", ":scope { padding: 4px; } p { margin-left: 3px; }");
        expect(document.adoptedStyleSheets.length).toBe(before + 1);

        const el = mount(html`<section class=${card}><p>inner</p></section><p>outside</p>`);
        const section = el.querySelector("section") as HTMLElement;
        const inner = el.querySelector("section p") as HTMLElement;
        expect(getComputedStyle(section).paddingTop).toBe("4px");
        expect(getComputedStyle(inner).marginLeft).toBe("3px");
        expect(getComputedStyle(el.querySelector("section + p") as HTMLElement).marginLeft).toBe("0px");

        expect(styleFile("src/live-card.css", ":scope { padding: 9px; }")).toBe(card);
        expect(document.adoptedStyleSheets.length).toBe(before + 1);
        expect(section.className).toBe(String(card));
        expect(getComputedStyle(section).paddingTop).toBe("9px");
        expect(getComputedStyle(inner).marginLeft).toBe("0px");
    });
});
