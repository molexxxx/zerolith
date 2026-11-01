/*
 * Conditions: when shows one view or another as a signal changes. A
 * branch is built the first time it shows and taken down when it hides,
 * which stops whatever it started, such as the timer in Welcome.
 *
 * Try: sign in, wait a few seconds, sign out, and sign in again: the
 * timer starts over, because the branch is built anew each time.
 */
import { html, onDispose, render, signal, when } from "zerolith";

const user = signal(null);

function SignIn()
{
    return html`
        <p>You are signed out.</p>
        <button @click=${() => user.set("Ada")}>Sign in as Ada</button>`;
}

function Welcome()
{
    const seconds = signal(0);
    const timer = setInterval(() => seconds.set(seconds.get() + 1), 1000);
    onDispose(() => clearInterval(timer));
    return html`
        <p>Hello, ${user}. Signed in for ${seconds} s.</p>
        <button @click=${() => user.set(null)}>Sign out</button>`;
}

render(html`<section>${when(user, Welcome, SignIn)}</section>`, "#app");
