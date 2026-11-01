"use client";
import { signal } from "zerolith";
import { Card } from "./card.tsx";
import * as ui from "./ui.tsx";

const count = signal(0);
const _Row = (props: { label: string }) => <li>{props.label}</li>;
const $slot = () => <slot name="extra" />;
const ñandú = () => <p>bird</p>;

export function App()
{
    return (
        <main class="app" on:click={() => count.set(count.get() + 1)} prop:value={count} bool:hidden={false}>
            <Card title="Count">{count}</Card>
            <ui.Badge tone="info" />
            <_Row label="row" />
            <$slot />
            <ñandú />
            <my-element data-id="1"></my-element>
            <>
                <input value={count} />
                <br />
            </>
        </main>
    );
}
