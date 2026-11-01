import type { View } from "zerolith";

export function NotFound({ path }: { path: string }): View
{
    return (
        <section>
            <h1>Not found</h1>
            <p>Nothing lives at {path}.</p>
        </section>
    );
}
