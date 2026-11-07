// The sign-up page: the form, checked on submit and as you type.
import { type View, computed, html, signal } from "zerolith";
import { createForm, formValues } from "@zerolith/forms";
import {
    type FieldName, type Fields, rules, signUpSchema
} from "../schema.ts";
import { Checkbox } from "./checkbox.ts";
import type { MessageText } from "./message.ts";
import { PasswordRules } from "./password-rules.ts";
import { PlanChoice } from "./plan-choice.ts";
import page from "./sign-up.css?scoped";
import { TextField } from "./text-field.ts";

/** What the form holds now, as the browser would send it. */
function read(form: HTMLFormElement): Fields
{
    return formValues(new FormData(form));
}

export function SignUp(): View
{
    const values = signal<Fields>({});
    const sent = signal<Fields | undefined>(undefined);
    const signUp = createForm({
        schema: signUpSchema,
        onFailure: (problem, form) =>
        {
            const now = read(form);
            sent.set(now);
            values.set(now);
        }
    });
    const message = (name: FieldName): MessageText =>
    {
        const field = signUp.field(name);
        return computed(() =>
        {
            const before = sent.get();
            const now = values.get();
            return before === undefined || now[name] === before[name]
                ? field.error.get()
                : rules[name](now);
        });
    };
    const typed = (event: Event): void =>
        values.set(read(event.currentTarget as HTMLFormElement));
    return html`
        <section class=${page}>
            <h1>Create your account</h1>
            <form method="post" action="/api/sign-ups" novalidate
                @submit=${signUp.submit} @input=${typed}>
                ${TextField({ name: "name", label: "Name", type: "text",
                    autocomplete: "name", message: message("name") })}
                ${TextField({ name: "email", label: "Email", type: "email",
                    autocomplete: "email", message: message("email") })}
                ${TextField({ name: "password", label: "Password",
                    type: "password", autocomplete: "new-password",
                    message: message("password"),
                    hint: PasswordRules({ values }) })}
                ${PlanChoice({ message: message("plan") })}
                ${Checkbox({ name: "terms", value: "accepted",
                    label: "I accept the terms of service",
                    message: message("terms") })}
                <button class="primary">Create account</button>
            </form>
        </section>`;
}
