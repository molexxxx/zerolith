// One release's page: its summary, its date, and its notes.
import { type View, computed, each, html, when } from "zerolith";
import { releaseDate } from "../dates.ts";
import { router } from "../router.ts";
import { releases } from "../store.ts";
import { LoadStatus } from "./load-status.ts";

export function ReleasePage({ version }: { version: string }): View
{
    const release = computed(() =>
        releases.get()?.find((item) => item.version === version));
    const missing = computed(() =>
        releases.get() !== undefined && release.get() === undefined);
    const summary = computed(() => release.get()?.summary);
    const day = computed(() => release.get()?.date);
    const date = computed(() =>
    {
        const released = day.get();
        return released === undefined ? "" : releaseDate(released);
    });
    const notes = computed(() => release.get()?.notes ?? []);
    return html`
        <section>
            <h1 tabindex="-1">Version ${version}</h1>
            ${LoadStatus()}
            ${when(release, () => html`
                <p>${summary}, released
                    <time datetime=${day}>${date}</time>.</p>
                <ul>${each(notes, (note) => note,
                    (note) => html`<li>${note}</li>`)}
                </ul>`)}
            ${when(missing, () => html`
                <p>There is no release with this version.</p>`)}
            <p><a href=${router.href("releases")}>Every release</a></p>
        </section>`;
}
