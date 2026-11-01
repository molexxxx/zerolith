// Shown for an address under the app that no route matches.
import { type View, css, html } from "zerolith";
import { router } from "../router.ts";

const page = css`
    :scope { display: grid; gap: 1rem; max-width: 40rem; }
    h1 { font-size: var(--display); }
`;

export function NotFound({ path }: { path: string }): View
{
    return html`
        <section class=${page}>
            <p class="eyebrow">Not found</p>
            <h1>Nothing here.</h1>
            <p>No page lives at <code>${path}</code>.</p>
            <p><a href=${router.href("dashboard")}>Back to the dashboard</a></p>
        </section>`;
}
