// The sign-up page, with focus and announcements for every outcome.
import {
    type Problem, type View, computed, html, signal, when
} from "zerolith";
import { createAnnouncer } from "@zerolith/a11y";
import { createForm, formValues } from "@zerolith/forms";
import {
    type Account, type FieldName, type Fields, rules, signUpSchema
} from "../schema.ts";
import { Checkbox } from "./checkbox.ts";
import { Message, type MessageText } from "./message.ts";
import { PasswordRules } from "./password-rules.ts";
import { PlanChoice } from "./plan-choice.ts";
import page from "./sign-up.css?scoped";
import { TextField } from "./text-field.ts";
import { Welcome } from "./welcome.ts";

const unsent = "The sign-up did not go through. Try again in a moment.";
const announcer = createAnnouncer();

/** What the form holds now, as the browser would send it. */
function read(form: HTMLFormElement): Fields
{
    return formValues(new FormData(form));
}

/**
 * Moves focus to the first field the problem names, in the order the form
 * shows them, and announces how many need a change. When it names none,
 * focus goes back to the button, which lost it while it was disabled.
 */
function report(problem: Problem | undefined, form: HTMLFormElement): void
{
    const names = Object.keys(problem?.fields ?? {});
    const first = [...form.elements].find((control) =>
        names.includes((control as HTMLInputElement).name));
    if (first instanceof HTMLElement)
    {
        first.focus();
        const count = names.length === 1 ? "1 field" : `${names.length} fields`;
        announcer.announce(`Fix ${count} to create your account.`);
        return;
    }
    form.querySelector("button")?.focus();
    announcer.announce(unsent);
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
            report(problem, form);
        },
        onError: (error, form) => report(undefined, form)
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
    const failed = computed(() =>
    {
        const status = signUp.status.get();
        const fields = Object.keys(signUp.problem.get()?.fields ?? {});
        const unnamed = status === "failure" && fields.length === 0;
        return status === "error" || unnamed ? unsent : undefined;
    });
    const done = computed(() => signUp.status.get() === "success");
    const account = computed(() =>
        signUp.result.get() as Account | undefined);
    const action = computed(() =>
        (signUp.pending.get() ? "Creating your account…" : "Create account"));
    return html`
        <section class=${page}>
            ${when(done, () => Welcome({ account }), () => html`
                <h1>Create your account</h1>
                <form method="post" action="/api/sign-ups" novalidate
                    @submit=${signUp.submit} @input=${typed}>
                    ${TextField({ name: "name", label: "Name", type: "text",
                        autocomplete: "name", message: message("name") })}
                    ${TextField({ name: "email", label: "Email",
                        type: "email", autocomplete: "email",
                        message: message("email") })}
                    ${TextField({ name: "password", label: "Password",
                        type: "password", autocomplete: "new-password",
                        message: message("password"),
                        hint: PasswordRules({ values }) })}
                    ${PlanChoice({ message: message("plan") })}
                    ${Checkbox({ name: "terms", value: "accepted",
                        label: "I accept the terms of service",
                        message: message("terms") })}
                    ${Message({ id: "sign-up-message", text: failed })}
                    <button class="primary" ?disabled=${signUp.pending}>
                        ${action}
                    </button>
                </form>`)}
        </section>`;
}
