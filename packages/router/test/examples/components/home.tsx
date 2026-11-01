import type { View } from "zerolith";
import { releases } from "../releases.ts";
import { router } from "../router.ts";

/** Every release, each linked to its page. */
export function Home(): View
{
    return (
        <section>
            <h1>Releases</h1>
            <ul>
                {releases.map((release) => <li><a href={router.href("release", { tag: release.tag })}>{release.name}</a></li>)}
            </ul>
        </section>
    );
}
