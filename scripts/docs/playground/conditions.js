import { html, render, signal, when } from "zerolith";

const user = signal(null);

function SignIn()
{
    return html`
        <p>You are signed out.</p>
        <button @click=${() => user.set("Ada")}>Sign in as Ada</button>`;
}

function Welcome()
{
    return html`
        <p>Hello, ${user}.</p>
        <button @click=${() => user.set(null)}>Sign out</button>`;
}

render(html`<section>${when(user, Welcome, SignIn)}</section>`, "#app");
