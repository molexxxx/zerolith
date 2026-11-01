// The sign-in page, for anyone without a session. The form posts to the API
// as a native form would; @zerolith/forms sends it with fetch, runs the
// shared schema first, and shows the backend's answer next to its field.
import { createForm } from "@zerolith/forms";
import { type View, css, html } from "zerolith";
import { signInSchema } from "../../shared/schema.ts";
import { router } from "../router.ts";
import { reloadSession } from "../store.ts";
import { Field } from "./ui.ts";

const page = css`
    :scope { min-height: 100vh; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr)); }
    .poster { display: grid; align-content: space-between; gap: 3rem; padding: clamp(2rem, 6vw, 5rem); background: var(--accent); color: var(--on-accent); }
    .poster .eyebrow { color: var(--on-accent); }
    .poster h1 { max-width: 11ch; font-size: var(--display); }
    .poster p:last-child { max-width: 30rem; font-size: 1.125rem; font-weight: 500; }
    form { display: grid; align-content: center; gap: 1rem; width: 100%; max-width: 30rem; margin: 0 auto; padding: clamp(2rem, 6vw, 5rem) clamp(1rem, 4vw, 3rem); }
    h2 { font-size: 2.25rem; }
    .hint { color: var(--muted); font-size: 0.875rem; }
`;

export function SignIn(): View
{
    const form = createForm({
        schema: signInSchema,
        onSuccess: () =>
        {
            reloadSession();
            void router.navigate(router.url.get().href, { replace: true });
        }
    });
    return html`
        <main class=${page}>
            <section class="poster">
                <p class="eyebrow">Harbor</p>
                <h1>Every project, in one harbor.</h1>
                <p>Plan the work, see who is doing what, and watch it land as it happens.</p>
            </section>
            <form method="post" action="/api/session" @submit=${form.submit}>
                <h2>Sign in</h2>
                ${Field({ form, name: "email", label: "Email", type: "email", required: true, autocomplete: "username" })}
                ${Field({ form, name: "password", label: "Password", type: "password", required: true, autocomplete: "current-password" })}
                <button class="primary" ?disabled=${form.pending}>Sign in</button>
                <p class="hint">Try <code>ada@harbor.test</code> with the password <code>analytical</code>.</p>
            </form>
        </main>`;
}
