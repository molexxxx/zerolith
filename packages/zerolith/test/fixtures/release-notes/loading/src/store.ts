// The releases, loaded once from public/data/releases.json for every page.
import { resource } from "zerolith";

export interface Release
{
    version: string;
    date: string;
    summary: string;
    notes: string[];
}

/** A response outside 2xx, with its status for the retry to judge. */
class HttpError extends Error
{
    readonly status: number;

    constructor(status: number)
    {
        super(`HTTP ${status}`);
        this.status = status;
    }
}

export const releases = resource({
    params: () => `${import.meta.env.BASE_URL}data/releases.json`,
    loader: async ({ params, abort }) =>
    {
        const response = await fetch(params, { signal: abort });
        if (!response.ok)
        {
            throw new HttpError(response.status);
        }
        return (await response.json()) as Release[];
    },
    timeout: 10_000,
    retry: 2,
    retryIf: (error) => !(error instanceof HttpError) || error.status >= 500
});
