"use client";import { html as __zl_html } from "zerolith"; 
import { signal } from "zerolith";
import { Card } from "./card.tsx";
import * as ui from "./ui.tsx";

const count = signal(0);
const _Row = (props: { label: string }) => (__zl_html`<li>${props.label}</li>`);
const $slot = () => (__zl_html`<slot name="extra"></slot>`);
const ñandú = () => (__zl_html`<p>bird</p>`);

export function App()
{
    return (
        (__zl_html`<main class="app" @click=${() => count.set(count.get() + 1)} .value=${count} ?hidden=${false}>${Card({ title: "Count", children: count })}${ui.Badge({ tone: "info" })}${_Row({ label: "row" })}${$slot({})}${ñandú({})}<my-element data-id="1"></my-element><input value=${count}><br></main>`










)
    );
}
