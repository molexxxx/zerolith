// What a page says while the releases load, and after they fail to.
import { type ResourceStatus, type View, computed, html, when } from "zerolith";
import { releases } from "../store.ts";

const messages: Record<ResourceStatus, string> = {
    idle: "",
    pending: "Loading the releases",
    resolved: "",
    error: "The releases did not load."
};

/**
 * Loads the releases again. The button goes away while they load, so
 * focus moves to the page's heading first rather than being lost with it.
 */
function retry(event: Event): void
{
    const page = (event.currentTarget as Element).closest("section");
    page?.querySelector("h1")?.focus();
    releases.reload();
}

export function LoadStatus(): View
{
    const message = computed(() => messages[releases.status.get()]);
    const failed = computed(() => releases.status.get() === "error");
    return html`
        <p role="status">${message}</p>
        ${when(failed, () => html`
            <button type="button" @click=${retry}>Try again</button>`)}`;
}
