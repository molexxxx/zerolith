/*
 * Conditions: when shows one view or another as a signal changes. A
 * branch is built the first time it shows and taken down when it hides,
 * which stops whatever it started, such as the timer in Welcome.
 *
 * Try: sign in, wait a few seconds, sign out, and sign in again: the
 * timer starts over, because the branch is built anew each time.
 */
import { css, html, onDispose, render, signal, when } from "zerolith";

const user = signal(null);

const panel = css`
    :scope {
        display: grid;
        gap: 16px;
        justify-items: start;
        max-width: 400px;
        padding: clamp(20px, 5vw, 32px);
        border: 2px solid var(--line);
        background: var(--surface);
    }
    h2 { font-size: 28px; }
    p { margin: 0; color: var(--muted); }
    .who { display: flex; align-items: center; gap: 16px; }
    .initials {
        display: grid;
        place-items: center;
        width: 56px;
        height: 56px;
        background: var(--text);
        color: var(--bg);
        font: 600 20px var(--font-display);
    }
    .time { color: var(--text); font-family: var(--font-mono); }
`;

function SignIn()
{
    return html`
        <h2>Signed out</h2>
        <p>Signing in starts a session timer; signing out stops it.</p>
        <button class="primary" @click=${() => user.set("Ada Lovelace")}>
            Sign in as Ada
        </button>`;
}

function Welcome()
{
    const seconds = signal(0);
    const timer = setInterval(() => seconds.set(seconds.get() + 1), 1000);
    onDispose(() => clearInterval(timer));
    return html`
        <div class="who">
            <span class="initials" aria-hidden="true">AL</span>
            <h2>${user}</h2>
        </div>
        <p>Signed in for <span class="time">${seconds} s</span>.</p>
        <button @click=${() => user.set(null)}>Sign out</button>`;
}

render(html`
    <section class=${panel}>${when(user, Welcome, SignIn)}</section>`,
    "#app");
