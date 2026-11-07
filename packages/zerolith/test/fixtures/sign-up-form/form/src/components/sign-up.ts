// The sign-up page: a native form with a label for every field.
import { type View, html } from "zerolith";
import page from "./sign-up.css?scoped";

export function SignUp(): View
{
    return html`
        <section class=${page}>
            <h1>Create your account</h1>
            <form method="post" action="/api/sign-ups">
                <div>
                    <label for="name">Name</label>
                    <input id="name" name="name" autocomplete="name" required>
                </div>
                <div>
                    <label for="email">Email</label>
                    <input id="email" name="email" type="email"
                        autocomplete="email" required>
                </div>
                <div>
                    <label for="password">Password</label>
                    <input id="password" name="password" type="password"
                        autocomplete="new-password" required>
                </div>
                <fieldset>
                    <legend>Plan</legend>
                    <label>
                        <input type="radio" name="plan" value="free" required>
                        Free: three notebooks, no charge
                    </label>
                    <label>
                        <input type="radio" name="plan" value="plus" required>
                        Plus: unlimited notebooks, $4 a month
                    </label>
                    <label>
                        <input type="radio" name="plan" value="team" required>
                        Team: shared notebooks, $8 a user a month
                    </label>
                </fieldset>
                <label>
                    <input type="checkbox" name="terms" value="accepted"
                        required>
                    I accept the terms of service
                </label>
                <button class="primary">Create account</button>
            </form>
        </section>`;
}
