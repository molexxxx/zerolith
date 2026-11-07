// What the page shows once the account exists, from the server's answer.
import { type ReadableSignal, type View, computed, html } from "zerolith";
import { type Account, plans } from "../schema.ts";

/**
 * Moves focus to the element once it is in the page. A ref runs while the
 * element is created, before it is inserted, so the focus waits a
 * microtask.
 */
function focusOnArrival(element: Element): void
{
    queueMicrotask(() => (element as HTMLElement).focus());
}

export interface WelcomeProps
{
    account: ReadableSignal<Account | undefined>;
}

export function Welcome({ account }: WelcomeProps): View
{
    const name = computed(() => account.get()?.name);
    const email = computed(() => account.get()?.email);
    const plan = computed(() =>
        plans.find((choice) => choice.id === account.get()?.plan)?.name);
    return html`
        <h1 tabindex="-1" ref=${focusOnArrival}>Welcome, ${name}</h1>
        <p>Your ${plan} account for ${email} is ready.</p>`;
}
