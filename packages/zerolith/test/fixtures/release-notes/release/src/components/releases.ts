// The releases, newest first, with what the page says while they load.
import { type View, computed, each, html } from "zerolith";
import { releases } from "../store.ts";
import { LoadStatus } from "./load-status.ts";
import { PageHeading } from "./page-heading.ts";
import { ReleaseRow } from "./release-row.ts";

export function Releases(): View
{
    const all = computed(() => releases.get() ?? []);
    return html`
        <section>
            ${PageHeading({ text: "Release notes" })}
            ${LoadStatus()}
            <ul>${each(all, (release) => release.version,
                (release) => ReleaseRow({ release }))}
            </ul>
        </section>`;
}
