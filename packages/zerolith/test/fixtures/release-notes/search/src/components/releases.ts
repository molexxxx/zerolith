// The releases, newest first, with a search that waits for a pause in typing.
import { type View, computed, css, each, html, signal } from "zerolith";
import { debounced } from "@zerolith/state";
import { type Release, releases } from "../store.ts";
import { LoadStatus } from "./load-status.ts";
import { ReleaseRow } from "./release-row.ts";

const page = css`
    search { display: block; margin-top: 1rem; }
`;

/** The words of a search, in lower case. */
function wordsOf(search: string): string[]
{
    return search.toLowerCase().split(/\s+/).filter((word) => word !== "");
}

/** Whether a release mentions every word, in its version, summary, or notes. */
function mentions(release: Release, words: string[]): boolean
{
    const text = [release.version, release.summary, ...release.notes]
        .join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
}

/** How many releases a search found, in words. */
function found(count: number): string
{
    if (count === 0)
    {
        return "No release matches.";
    }
    return count === 1 ? "1 release matches." : `${count} releases match.`;
}

export function Releases(): View
{
    const query = signal("");
    const settled = debounced(query, 300);
    const words = computed(() => wordsOf(settled.get()));
    const shown = computed(() => (releases.get() ?? [])
        .filter((release) => mentions(release, words.get())));
    const summary = computed(() =>
        (words.get().length > 0 && releases.get() !== undefined
            ? found(shown.get().length)
            : ""));
    function typed(event: Event): void
    {
        query.set((event.currentTarget as HTMLInputElement).value);
    }
    return html`
        <section class=${page}>
            <h1 tabindex="-1">Release notes</h1>
            <search>
                <label>Search the notes
                    <input type="search" .value=${query} @input=${typed}>
                </label>
            </search>
            ${LoadStatus()}
            <p role="status">${summary}</p>
            <ul>${each(shown, (release) => release.version,
                (release) => ReleaseRow({ release }))}
            </ul>
        </section>`;
}
