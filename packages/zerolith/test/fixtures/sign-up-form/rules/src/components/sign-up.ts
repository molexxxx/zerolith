// The sign-up page: a form checked with the rules in schema.ts on submit.
import { type View, html } from "zerolith";
import { createForm } from "@zerolith/forms";
import { type FieldName, signUpSchema } from "../schema.ts";
import { Checkbox } from "./checkbox.ts";
import type { MessageText } from "./message.ts";
import { PlanChoice } from "./plan-choice.ts";
import page from "./sign-up.css?scoped";
import { TextField } from "./text-field.ts";

export function SignUp(): View
{
    const signUp = createForm({ schema: signUpSchema });
    const message = (name: FieldName): MessageText => signUp.field(name).error;
    return html`
        <section class=${page}>
            <h1>Create your account</h1>
            <form method="post" action="/api/sign-ups" novalidate
                @submit=${signUp.submit}>
                ${TextField({ name: "name", label: "Name", type: "text",
                    autocomplete: "name", message: message("name") })}
                ${TextField({ name: "email", label: "Email", type: "email",
                    autocomplete: "email", message: message("email") })}
                ${TextField({ name: "password", label: "Password",
                    type: "password", autocomplete: "new-password",
                    message: message("password") })}
                ${PlanChoice({ message: message("plan") })}
                ${Checkbox({ name: "terms", value: "accepted",
                    label: "I accept the terms of service",
                    message: message("terms") })}
                <button class="primary">Create account</button>
            </form>
        </section>`;
}
