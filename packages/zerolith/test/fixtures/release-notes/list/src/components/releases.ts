// The releases, newest first, as the file lists them.
import { type View, computed, each, html } from "zerolith";
import { releases } from "../store.ts";
import { ReleaseRow } from "./release-row.ts";

export function Releases(): View
{
    const all = computed(() => releases.get() ?? []);
    return html`
        <section>
            <h1>Release notes</h1>
            <ul>${each(all, (release) => release.version,
                (release) => ReleaseRow({ release }))}
            </ul>
        </section>`;
}
