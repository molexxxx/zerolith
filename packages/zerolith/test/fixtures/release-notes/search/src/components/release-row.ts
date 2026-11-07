// One release in the list: a link to its page, its date, and its summary.
import { type ReadableSignal, type View, computed, html } from "zerolith";
import { releaseDate } from "../dates.ts";
import { router } from "../router.ts";
import type { Release } from "../store.ts";

type Props = { release: ReadableSignal<Release> };

export function ReleaseRow({ release }: Props): View
{
    const version = computed(() => release.get().version);
    const href = computed(() =>
        router.href("release", { version: version.get() }));
    const day = computed(() => release.get().date);
    const date = computed(() => releaseDate(day.get()));
    const summary = computed(() => release.get().summary);
    return html`
        <li>
            <a href=${href}>Version ${version}</a>
            <time datetime=${day}>${date}</time>
            <p>${summary}</p>
        </li>`;
}
