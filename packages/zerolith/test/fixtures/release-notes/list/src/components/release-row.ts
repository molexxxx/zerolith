// One release in the list: its version and its summary.
import { type ReadableSignal, type View, computed, html } from "zerolith";
import type { Release } from "../store.ts";

type Props = { release: ReadableSignal<Release> };

export function ReleaseRow({ release }: Props): View
{
    const version = computed(() => release.get().version);
    const summary = computed(() => release.get().summary);
    return html`
        <li>
            <strong>Version ${version}</strong>
            <p>${summary}</p>
        </li>`;
}
