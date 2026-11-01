"use strict";import { prepared as __zl_prepared } from "zerolith/internal";
import { html, render } from "zerolith";
import { html as litHtml } from "lit";
import type { View } from "zerolith";

const __zl_t0 = __zl_prepared(["<p class=\"card\">","</p>"], "<p class=\"card\"><!--zl$--></p>", [[0,"",[]]]);const __zl_t1 = __zl_prepared(["<li>","</li>"], "<li><!--zl$--></li>", [[0,"",[]]]);const __zl_t2 = __zl_prepared(["<main>","</main>"], "<main><!--zl$--></main>", [[0,"",[]]]);interface Sanitizer
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
    constructor(public view: View = html(__zl_t0, "card"))
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
    export const row = (label: string): View => html(__zl_t1, label);
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

render(html(__zl_t2, Views.row(format("a"))), "#app");
