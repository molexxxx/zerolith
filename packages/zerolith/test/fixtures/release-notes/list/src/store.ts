// The releases, loaded once from public/data/releases.json for every page.
import { resource } from "zerolith";

export interface Release
{
    version: string;
    date: string;
    summary: string;
    notes: string[];
}

export const releases = resource({
    params: () => `${import.meta.env.BASE_URL}data/releases.json`,
    loader: async ({ params, abort }) =>
    {
        const response = await fetch(params, { signal: abort });
        if (!response.ok)
        {
            throw new Error(`${params} answered ${response.status}`);
        }
        return (await response.json()) as Release[];
    }
});
