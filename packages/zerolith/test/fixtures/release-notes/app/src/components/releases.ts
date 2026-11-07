// The releases, newest first, with a search kept in the page's address.
import {
    type View, computed, css, each, effect, html, signal
} from "zerolith";
import { debounced } from "@zerolith/state";
import { router } from "../router.ts";
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

/** The search an address holds, after `?q=`. */
function searchIn(address: URL): string
{
    return address.searchParams.get("q") ?? "";
}

/** Puts a search in the address, unless it is already there. */
function keepInAddress(search: string): void
{
    const address = new URL(location.href);
    if (search !== searchIn(address))
    {
        if (search === "")
        {
            address.searchParams.delete("q");
        }
        else
        {
            address.searchParams.set("q", search);
        }
        void router.navigate(address.href, { replace: true, shallow: true });
    }
}

export function Releases(): View
{
    const query = signal(searchIn(router.url.get()));
    const settled = debounced(query, 300);
    effect(() => keepInAddress(settled.get()));
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
