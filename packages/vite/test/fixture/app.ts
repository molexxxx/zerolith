import { type View, html } from "zerolith";
import styles from "./app.css?scoped";
import { Counter } from "./counter.ts";

export function App(): View
{
    return html`<main class=${styles}><h1>HMR fixture</h1>${Counter()}</main>`;
}
