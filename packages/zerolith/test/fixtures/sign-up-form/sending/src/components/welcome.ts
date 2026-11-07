// What the page shows once the account exists, from the server's answer.
import { type ReadableSignal, type View, computed, html } from "zerolith";
import { type Account, plans } from "../schema.ts";

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
        <h1>Welcome, ${name}</h1>
        <p>Your ${plan} account for ${email} is ready.</p>`;
}
