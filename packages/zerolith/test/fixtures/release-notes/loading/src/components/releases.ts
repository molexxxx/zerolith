// The releases, newest first, with what the page says while they load.
import { type View, computed, each, html } from "zerolith";
import { releases } from "../store.ts";
import { LoadStatus } from "./load-status.ts";
import { ReleaseRow } from "./release-row.ts";

export function Releases(): View
{
    const all = computed(() => releases.get() ?? []);
    return html`
        <section>
            <h1 tabindex="-1">Release notes</h1>
            ${LoadStatus()}
            <ul>${each(all, (release) => release.version,
                (release) => ReleaseRow({ release }))}
            </ul>
        </section>`;
}
