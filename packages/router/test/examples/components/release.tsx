import { type View, computed, signal, when } from "zerolith";
import type { Head, LoadContext, RouteContext } from "@zerolith/router";
import { type Release, findRelease } from "../releases.ts";

type Props = RouteContext<{ tag: string }, Release | undefined>;

/** Loads the release the path names; the page shows once it resolves. */
export function loadRelease({ params }: LoadContext<{ tag: string }>): Promise<Release | undefined>
{
    return findRelease(params.tag);
}

/** The page title, from the loaded release. */
export function releaseHead({ data }: Props): Head
{
    return { title: data?.name ?? "Unknown release" };
}

/** One release, with its notes behind a toggle. */
export function ReleasePage({ params, data }: Props): View
{
    if (data === undefined)
    {
        return <h1>No release named {params.tag}</h1>;
    }
    const open = signal(false);
    return (
        <article>
            <h1>{data.name}</h1>
            <button on:click={() => open.set(!open.get())}>
                {computed(() => (open.get() ? "Hide notes" : "Show notes"))}
            </button>
            {when(open, () => <Notes items={data.notes} />)}
        </article>
    );
}

function Notes({ items }: { items: readonly string[] }): View
{
    return <ul>{items.map((item) => <li>{item}</li>)}</ul>;
}
