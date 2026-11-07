// One release in the list: a link to its page and its summary.
import { type ReadableSignal, type View, computed, html } from "zerolith";
import { router } from "../router.ts";
import type { Release } from "../store.ts";

type Props = { release: ReadableSignal<Release> };

export function ReleaseRow({ release }: Props): View
{
    const version = computed(() => release.get().version);
    const href = computed(() =>
        router.href("release", { version: version.get() }));
    const summary = computed(() => release.get().summary);
    return html`
        <li>
            <a href=${href}>Version ${version}</a>
            <p>${summary}</p>
        </li>`;
}
