import { html } from "zerolith";
import { Counter } from "./counter.ts";

export function App(): unknown
{
    return html`<main><h1>HMR fixture</h1>${Counter()}</main>`;
}
