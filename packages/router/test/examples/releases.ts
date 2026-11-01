/** A release as the application's API describes it. */
export interface Release
{
    tag: string;
    name: string;
    notes: string[];
}

export const releases: Release[] = [
    { tag: "v1", name: "First", notes: ["A typed route table", "Links checked by the compiler"] },
    { tag: "v2", name: "Second", notes: ["Pages loaded on first visit"] }
];

/** The release with a tag. An application fetches it from its API instead. */
export function findRelease(tag: string): Promise<Release | undefined>
{
    return Promise.resolve(releases.find((release) => release.tag === tag));
}
