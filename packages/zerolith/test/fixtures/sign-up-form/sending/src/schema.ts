// The sign-up rules, shared by the form and the server.
import type { StandardIssue, StandardSchema } from "@zerolith/forms";

export const plans = [
    { id: "free", name: "Free", detail: "three notebooks, no charge" },
    { id: "plus", name: "Plus", detail: "unlimited notebooks, $4 a month" },
    { id: "team", name: "Team", detail: "shared notebooks, $8 a user a month" }
] as const;

export type PlanId = (typeof plans)[number]["id"];

/** A sign-up that passes every rule. */
export interface SignUp
{
    name: string;
    email: string;
    password: string;
    plan: PlanId;
}

/** The account the server creates and answers with. */
export interface Account
{
    id: number;
    name: string;
    email: string;
    plan: PlanId;
}

/** The form's values by field name, as the browser sends them. */
export type Fields = Record<string, unknown>;

export type FieldName = "name" | "email" | "password" | "plan" | "terms";

/** A field's value as text, or the empty string when it is missing. */
function text(fields: Fields, name: string): string
{
    const value = fields[name];
    return typeof value === "string" ? value : "";
}

/** A rule for the password: its line in the checklist and its message. */
export interface PasswordRule
{
    label: string;
    message: string;
    passes: (fields: Fields) => boolean;
}

export const passwordRules: readonly PasswordRule[] = [
    {
        label: "At least 15 characters",
        message: "Use at least 15 characters.",
        passes: (fields) => [...text(fields, "password")].length >= 15
    },
    {
        label: "Does not contain your email address",
        message: "Use a password that does not contain your email address.",
        passes: (fields) =>
        {
            const password = text(fields, "password").toLowerCase();
            const email = text(fields, "email").trim().toLowerCase();
            return password !== ""
                && (email === "" || !password.includes(email));
        }
    }
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A field's rule: its message for the values given, or undefined. */
export type Rule = (fields: Fields) => string | undefined;

export const rules: Record<FieldName, Rule> = {
    name: (fields) => (text(fields, "name").trim() === ""
        ? "Enter your name."
        : undefined),
    email: (fields) => (emailPattern.test(text(fields, "email").trim())
        ? undefined
        : "Enter an email address like name@example.com."),
    password: (fields) => (text(fields, "password") === ""
        ? "Choose a password."
        : passwordRules.find((rule) => !rule.passes(fields))?.message),
    plan: (fields) => (plans.some((plan) => plan.id === fields["plan"])
        ? undefined
        : "Choose a plan."),
    terms: (fields) => (fields["terms"] === "accepted"
        ? undefined
        : "Accept the terms to create your account.")
};

export const signUpSchema: StandardSchema<unknown, SignUp> = {
    "~standard": {
        version: 1,
        vendor: "sign-up",
        validate(value)
        {
            const fields = typeof value === "object" && value !== null
                ? value as Fields
                : {};
            const issues: StandardIssue[] = [];
            for (const [name, rule] of Object.entries(rules))
            {
                const message = rule(fields);
                if (message !== undefined)
                {
                    issues.push({ message, path: [name] });
                }
            }
            if (issues.length > 0)
            {
                return { issues };
            }
            return {
                value: {
                    name: text(fields, "name").trim(),
                    email: text(fields, "email").trim(),
                    password: text(fields, "password"),
                    plan: fields["plan"] as PlanId
                }
            };
        }
    }
};
