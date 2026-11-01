import { html } from "zerolith";
import styles from "./app.css?scoped";
import { Counter } from "./counter.ts";

export function App(): unknown
{
    return html`<main class=${styles}><h1>HMR fixture</h1>${Counter()}</main>`;
}
