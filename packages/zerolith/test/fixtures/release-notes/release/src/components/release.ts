// One release's page: its summary and its notes.
import { type View, computed, each, html, when } from "zerolith";
import { router } from "../router.ts";
import { releases } from "../store.ts";
import { LoadStatus } from "./load-status.ts";
import { PageHeading } from "./page-heading.ts";

export function ReleasePage({ version }: { version: string }): View
{
    const release = computed(() =>
        releases.get()?.find((item) => item.version === version));
    const missing = computed(() =>
        releases.get() !== undefined && release.get() === undefined);
    const summary = computed(() => release.get()?.summary);
    const notes = computed(() => release.get()?.notes ?? []);
    return html`
        <section>
            ${PageHeading({ text: `Version ${version}` })}
            ${LoadStatus()}
            ${when(release, () => html`
                <p>${summary}</p>
                <ul>${each(notes, (note) => note,
                    (note) => html`<li>${note}</li>`)}
                </ul>`)}
            ${when(missing, () => html`
                <p>There is no release with this version.</p>`)}
            <p><a href=${router.href("releases")}>Every release</a></p>
        </section>`;
}
