/// <reference types="zerolith/imports" />
import { afterEach, describe, expect, it } from "vitest";
import { type Root, html, render } from "zerolith";
import card from "./fixtures/scoped-card.css?scoped";

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() =>
{
    root?.dispose();
    root = undefined;
    host?.remove();
    host = undefined;
});

describe("a stylesheet imported with ?scoped", () =>
{
    it("scopes the file's rules, its imports included, to the element that binds it", () =>
    {
        host = document.createElement("div");
        document.body.append(host);
        root = render(html`<section class=${card}><p>inner</p></section><p>outside</p>`, host);
        const section = host.querySelector("section") as HTMLElement;
        expect(card.scope).toMatch(/^zl-scoped-card-[0-9a-z]+$/);
        expect(section.className).toBe(`zl-s ${card.scope}`);
        expect(getComputedStyle(section).paddingTop).toBe("5px");
        expect(getComputedStyle(section.querySelector("p") as HTMLElement).color).toBe("rgb(0, 0, 255)");
        expect(getComputedStyle(host.querySelector("section + p") as HTMLElement).color).not.toBe("rgb(0, 0, 255)");
    });
});
