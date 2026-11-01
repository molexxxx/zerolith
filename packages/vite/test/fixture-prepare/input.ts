"use strict";
import { html, render } from "zerolith";
import { html as litHtml } from "lit";
import type { View } from "zerolith";

interface Sanitizer
{
    clean(html: string): string;
}

type Tagged = (html: TemplateStringsArray) => View;

export function format(html: string): string;
export function format(value: string): string
{
    return value;
}

export class Card
{
    constructor(public view: View = html`<p class="card">${"card"}</p>`)
    {
    }

    title(html: string): string;
    title(value: string): string
    {
        return value;
    }
}

export namespace Views
{
    export const row = (label: string): View => html`<li>${label}</li>`;
}

html: for (const item of [1, 2])
{
    if (item > 1)
    {
        break html;
    }
}

const sanitizer: Sanitizer = { clean: (value) => value };
const tagged: Tagged | undefined = undefined;

export { litHtml as html2, sanitizer, tagged };
export { html as plainHtml } from "lit";

render(html`<main>${Views.row(format("a"))}</main>`, "#app");
