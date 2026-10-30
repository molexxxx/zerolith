import { computed, html, signal } from "zerolith";
import { html as __zl_html } from "zerolith";

const count = signal(0);
const item = signal({ name: "a" });
const label = "Grüße 😀";

export const live = html`<p>${count}</p>`;
export const frozen = html`<p title=${count.get()}>${item.get().name}</p>`;
export const derived = html`<p>${computed(() => item.get().name)}</p>`;
export const handler = html`<button @click=${() => count.set(count.get() + 1)}>Add</button>`;
export const method = html`<p>${{ read() { return count.get(); } }}</p>`;
export const optional = (maybe) => html`<p>${maybe?.get()}</p>`;
export const computedKey = (map) => html`<p>${map["get"]()}</p>`;
export const nested = (rows) => html`<ul>${rows.map((row) => html`<li>${row.get()}</li>`)}</ul>`;

export const images = html`
    <img src="/a.png">
    <img src="/b.png" alt="">
    <img src=${"/c.png"} alt=${label}>
    <IMG SRC="/d.png">
    <imgx src="/e.png">
`;
export const buttons = html`
    <button></button>
    <button>   </button>
    <button aria-label="Close"></button>
    <BUTTON TITLE="Close"></BUTTON>
    <button aria-labelledby="t"></button>
    <button>${"label"}</button>
    <button><svg aria-hidden="true"></svg></button>
    <button type="button"></button >
`;
export const frames = html`<iframe src="/x"></iframe><iframe title="Map" src="/y"></iframe>`;
export const lowered = __zl_html`${label} <img src="/ü.png">`;
export const unrelated = `<img src="/plain-string.png">`;
